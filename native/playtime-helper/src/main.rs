use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(windows)]
use std::mem::{size_of, zeroed};
#[cfg(windows)]
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
#[cfg(windows)]
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
#[cfg(windows)]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, QueryInformationJobObject, JobObjectBasicProcessIdList,
    JOBOBJECT_BASIC_PROCESS_ID_LIST,
};
#[cfg(windows)]
use windows_sys::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
};

const HEARTBEAT_INTERVAL_MS: u64 = 30_000;
const POLL_INTERVAL_MS: u64 = 1_000;
const SESSION_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug)]
enum HelperMode {
    Launch,
    Attach,
}

#[derive(Clone, Debug)]
struct HelperConfig {
    mode: HelperMode,
    journal_path: PathBuf,
    db_path: PathBuf,
    log_path: PathBuf,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionJournal {
    schema_version: u32,
    session_id: String,
    game_key: String,
    exe_path: String,
    cwd: String,
    mode: String,
    helper_pid: u32,
    root_pid: u32,
    started_at: u64,
    last_heartbeat_at: u64,
    accrued_ms: u64,
    status: String,
    #[serde(default)]
    ended_at: Option<u64>,
    #[serde(default)]
    failure_reason: Option<String>,
    #[serde(default)]
    runner: Option<String>,
    #[serde(default)]
    runner_args: Option<Vec<String>>,
    #[serde(default)]
    env: Option<HashMap<String, String>>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_millis(0))
        .as_millis() as u64
}

fn parse_args() -> Result<HelperConfig> {
    let args: Vec<String> = env::args().skip(1).collect();
    let mode = match args.first().map(|value| value.as_str()) {
        Some("launch") => HelperMode::Launch,
        Some("attach") => HelperMode::Attach,
        other => return Err(anyhow!("unsupported or missing helper mode: {:?}", other)),
    };

    let mut values = HashMap::new();
    let mut index = 1usize;
    while index + 1 < args.len() {
        values.insert(args[index].clone(), args[index + 1].clone());
        index += 2;
    }

    let journal_path = PathBuf::from(
        values
            .get("--journal")
            .ok_or_else(|| anyhow!("missing --journal"))?,
    );
    let db_path = PathBuf::from(values.get("--db").ok_or_else(|| anyhow!("missing --db"))?);
    let log_path = PathBuf::from(values.get("--log").ok_or_else(|| anyhow!("missing --log"))?);

    Ok(HelperConfig {
        mode,
        journal_path,
        db_path,
        log_path,
    })
}

fn append_log(log_path: &Path, message: impl AsRef<str>) {
    if let Some(parent) = log_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = writeln!(file, "[{}][helper:{}] {}", now_ms(), std::process::id(), message.as_ref());
    }
}

fn read_journal(journal_path: &Path) -> Result<SessionJournal> {
    let content = fs::read_to_string(journal_path)
        .with_context(|| format!("failed to read journal {}", journal_path.display()))?;
    let journal: SessionJournal = serde_json::from_str(&content)
        .with_context(|| format!("failed to parse journal {}", journal_path.display()))?;
    Ok(journal)
}

fn write_journal(journal_path: &Path, journal: &SessionJournal) -> Result<()> {
    let payload = serde_json::to_string_pretty(journal)?;
    fs::write(journal_path, format!("{payload}\n"))
        .with_context(|| format!("failed to write journal {}", journal_path.display()))?;
    Ok(())
}

fn update_db_finalize(db_path: &Path, game_key: &str, accrued_ms: u64, ended_at: u64) -> Result<()> {
    let content = fs::read_to_string(db_path)
        .with_context(|| format!("failed to read db {}", db_path.display()))?;
    let mut db_value: Value = serde_json::from_str(&content)
        .with_context(|| format!("failed to parse db {}", db_path.display()))?;

    let db_object = db_value
        .as_object_mut()
        .ok_or_else(|| anyhow!("library db root is not an object"))?;
    let games_value = db_object
        .entry("games".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let games_object = games_value
        .as_object_mut()
        .ok_or_else(|| anyhow!("library db games field is not an object"))?;
    let game_value = games_object
        .get_mut(game_key)
        .ok_or_else(|| anyhow!("gameKey {} missing in library db", game_key))?;
    let game_object = game_value
        .as_object_mut()
        .ok_or_else(|| anyhow!("game record is not an object"))?;

    let existing_playtime = game_object
        .get("playtime")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    game_object.insert("playtime".to_string(), Value::from(existing_playtime.saturating_add(accrued_ms)));
    game_object.insert("lastPlayed".to_string(), Value::from(ended_at));

    let payload = serde_json::to_string_pretty(&db_value)?;
    fs::write(db_path, format!("{payload}\n"))
        .with_context(|| format!("failed to persist db {}", db_path.display()))?;
    Ok(())
}

/// Pure parser for `/proc/[pid]/stat` line to extract (pid, ppid).
/// Handles process comm names with spaces or nested parentheses by splitting at the last `)`.
pub fn parse_proc_stat_line(line: &str) -> Option<(u32, u32)> {
    let open_paren = line.find('(')?;
    let close_paren = line.rfind(')')?;
    if close_paren <= open_paren {
        return None;
    }

    let pid_str = line[..open_paren].trim();
    let pid: u32 = pid_str.parse().ok()?;

    let rest = line[close_paren + 1..].trim();
    let mut tokens = rest.split_whitespace();
    let _state = tokens.next()?;
    let ppid_str = tokens.next()?;
    let ppid: u32 = ppid_str.parse().ok()?;

    Some((pid, ppid))
}

#[cfg(windows)]
fn list_process_relations() -> Result<Vec<(u32, u32)>> {
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(anyhow!("CreateToolhelp32Snapshot failed"));
        }

        let mut relations = Vec::new();
        let mut entry: PROCESSENTRY32W = zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;

        let mut has_entry = Process32FirstW(snapshot, &mut entry);
        while has_entry != 0 {
            relations.push((entry.th32ProcessID, entry.th32ParentProcessID));
            has_entry = Process32NextW(snapshot, &mut entry);
        }

        CloseHandle(snapshot);
        Ok(relations)
    }
}

#[cfg(target_os = "linux")]
fn list_process_relations() -> Result<Vec<(u32, u32)>> {
    let mut relations = Vec::new();
    let proc_dir = match fs::read_dir("/proc") {
        Ok(dir) => dir,
        Err(err) => return Err(anyhow!("failed to read /proc: {}", err)),
    };

    for entry in proc_dir.flatten() {
        let file_name = entry.file_name();
        let name_str = match file_name.to_str() {
            Some(s) => s,
            None => continue,
        };

        if !name_str.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }

        let stat_path = entry.path().join("stat");
        if let Ok(content) = fs::read_to_string(&stat_path) {
            if let Some((pid, ppid)) = parse_proc_stat_line(&content) {
                relations.push((pid, ppid));
            }
        }
    }

    Ok(relations)
}

#[cfg(not(any(windows, target_os = "linux")))]
fn list_process_relations() -> Result<Vec<(u32, u32)>> {
    Ok(Vec::new())
}

fn pid_tree_has_live_members(root_pid: u32) -> Result<bool> {
    if root_pid == 0 {
        return Ok(false);
    }

    let relations = list_process_relations()?;
    let alive: HashSet<u32> = relations.iter().map(|(pid, _)| *pid).collect();
    let mut by_parent: HashMap<u32, Vec<u32>> = HashMap::new();
    for (pid, parent_pid) in relations {
        by_parent.entry(parent_pid).or_default().push(pid);
    }

    let mut queue = VecDeque::from([root_pid]);
    let mut visited = HashSet::new();
    while let Some(current_pid) = queue.pop_front() {
        if !visited.insert(current_pid) {
            continue;
        }
        if alive.contains(&current_pid) {
            return Ok(true);
        }
        if let Some(children) = by_parent.get(&current_pid) {
            for child_pid in children {
                queue.push_back(*child_pid);
            }
        }
    }

    Ok(false)
}

#[cfg(windows)]
fn get_pid_tree_members(root_pid: u32) -> Result<HashSet<u32>> {
    let mut members = HashSet::new();
    if root_pid == 0 {
        return Ok(members);
    }

    let relations = list_process_relations()?;
    let alive: HashSet<u32> = relations.iter().map(|(pid, _)| *pid).collect();
    let mut by_parent: HashMap<u32, Vec<u32>> = HashMap::new();
    for (pid, parent_pid) in relations {
        by_parent.entry(parent_pid).or_default().push(pid);
    }

    let mut queue = VecDeque::from([root_pid]);
    let mut visited = HashSet::new();
    while let Some(current_pid) = queue.pop_front() {
        if !visited.insert(current_pid) {
            continue;
        }
        if alive.contains(&current_pid) {
            members.insert(current_pid);
        }
        if let Some(children) = by_parent.get(&current_pid) {
            for child_pid in children {
                queue.push_back(*child_pid);
            }
        }
    }

    Ok(members)
}

#[cfg(windows)]
fn bring_game_to_foreground_async(root_pid: u32) {
    thread::spawn(move || {
        struct EnumData<'a> {
            target_pids: &'a HashSet<u32>,
            found: bool,
        }
        
        unsafe extern "system" fn enum_callback(hwnd: windows_sys::Win32::Foundation::HWND, lparam: isize) -> i32 {
            let data = &mut *(lparam as *mut EnumData);
            let mut process_id = 0;
            windows_sys::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(hwnd, &mut process_id);
            
            if data.target_pids.contains(&process_id) {
                if windows_sys::Win32::UI::WindowsAndMessaging::IsWindowVisible(hwnd) != 0 {
                    windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(hwnd, 5); // SW_SHOW = 5
                    windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow(hwnd);
                    data.found = true;
                }
            }
            1 // Continue enumeration
        }

        // Poll for up to 10 seconds (50 iterations * 200ms)
        for _ in 0..50 {
            if let Ok(pids) = get_pid_tree_members(root_pid) {
                if !pids.is_empty() {
                    let mut data = EnumData {
                        target_pids: &pids,
                        found: false,
                    };
                    unsafe {
                        windows_sys::Win32::UI::WindowsAndMessaging::EnumWindows(Some(enum_callback), &mut data as *mut _ as isize);
                    }
                    if data.found {
                        break;
                    }
                }
            }
            thread::sleep(Duration::from_millis(200));
        }
    });
}

#[cfg(not(windows))]
fn bring_game_to_foreground_async(_root_pid: u32) {
    // No-op on non-Windows platforms
}

#[cfg(windows)]
fn open_process_for_job(pid: u32) -> Result<HANDLE> {
    unsafe {
        let handle = OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SET_QUOTA | PROCESS_TERMINATE,
            0,
            pid,
        );
        if handle.is_null() {
            return Err(anyhow!("OpenProcess failed for pid {}", pid));
        }
        Ok(handle)
    }
}

#[cfg(windows)]
fn create_job_object() -> Result<HANDLE> {
    unsafe {
        let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if handle.is_null() {
            return Err(anyhow!("CreateJobObjectW failed"));
        }
        Ok(handle)
    }
}

#[cfg(windows)]
fn assign_root_to_job(job_handle: HANDLE, process_handle: HANDLE, pid: u32) -> Result<()> {
    unsafe {
        if AssignProcessToJobObject(job_handle, process_handle) == 0 {
            return Err(anyhow!("AssignProcessToJobObject failed for pid {}", pid));
        }
    }
    Ok(())
}

#[cfg(windows)]
fn job_has_processes(job_handle: HANDLE) -> Result<bool> {
    unsafe {
        let extra_capacity = 1024usize * size_of::<usize>();
        let buffer_size = size_of::<JOBOBJECT_BASIC_PROCESS_ID_LIST>() + extra_capacity;
        let mut buffer = vec![0u8; buffer_size];
        let ok = QueryInformationJobObject(
            job_handle,
            JobObjectBasicProcessIdList,
            buffer.as_mut_ptr() as *mut _,
            buffer_size as u32,
            std::ptr::null_mut(),
        );
        if ok == 0 {
            return Err(anyhow!("QueryInformationJobObject failed"));
        }
        let info = &*(buffer.as_ptr() as *const JOBOBJECT_BASIC_PROCESS_ID_LIST);
        Ok(info.NumberOfProcessIdsInList > 0)
    }
}

fn launch_game_process(journal: &SessionJournal) -> Result<u32> {
    let mut command = if let Some(runner) = &journal.runner {
        if !runner.trim().is_empty() {
            let mut cmd = Command::new(runner);
            if let Some(args) = &journal.runner_args {
                cmd.args(args);
            }
            cmd
        } else {
            Command::new(&journal.exe_path)
        }
    } else {
        Command::new(&journal.exe_path)
    };

    if let Some(env_vars) = &journal.env {
        for (key, val) in env_vars {
            command.env(key, val);
        }
    }

    command.current_dir(&journal.cwd);

    let child = command
        .spawn()
        .with_context(|| format!("failed to spawn game executable {} (runner: {:?})", journal.exe_path, journal.runner))?;
    Ok(child.id())
}

fn mark_failed(mut journal: SessionJournal, journal_path: &Path, reason: impl Into<String>) -> Result<()> {
    journal.status = "failed".to_string();
    journal.failure_reason = Some(reason.into());
    journal.last_heartbeat_at = now_ms();
    write_journal(journal_path, &journal)
}

fn heartbeat_until_exit<F>(
    mut journal: SessionJournal,
    journal_path: &Path,
    log_path: &Path,
    mut activity_check: F,
) -> Result<SessionJournal>
where
    F: FnMut() -> Result<bool>,
{
    let started_at = journal.started_at;
    let mut last_flush_at = journal.last_heartbeat_at.max(started_at);

    loop {
        if !activity_check()? {
            break;
        }

        let now = now_ms();
        if now.saturating_sub(last_flush_at) >= HEARTBEAT_INTERVAL_MS {
            journal.status = "running".to_string();
            journal.last_heartbeat_at = now;
            journal.accrued_ms = now.saturating_sub(started_at);
            write_journal(journal_path, &journal)?;
            append_log(
                log_path,
                format!(
                    "heartbeat sessionId={} gameKey={} accruedMs={}",
                    journal.session_id, journal.game_key, journal.accrued_ms
                ),
            );
            last_flush_at = now;
        }
        thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
    }

    Ok(journal)
}

fn finalize_session(mut journal: SessionJournal, journal_path: &Path, db_path: &Path, log_path: &Path) -> Result<()> {
    let ended_at = now_ms();
    journal.status = "finalizing".to_string();
    journal.ended_at = Some(ended_at);
    journal.last_heartbeat_at = ended_at;
    journal.accrued_ms = ended_at.saturating_sub(journal.started_at);
    write_journal(journal_path, &journal)?;
    append_log(
        log_path,
        format!(
            "finalizing sessionId={} gameKey={} accruedMs={} endedAt={}",
            journal.session_id, journal.game_key, journal.accrued_ms, ended_at
        ),
    );

    update_db_finalize(db_path, &journal.game_key, journal.accrued_ms, ended_at)?;

    journal.status = "completed".to_string();
    write_journal(journal_path, &journal)?;
    append_log(
        log_path,
        format!("completed sessionId={} gameKey={}", journal.session_id, journal.game_key),
    );
    Ok(())
}

#[cfg(windows)]
fn run_launch_mode(config: &HelperConfig) -> Result<()> {
    let mut journal = read_journal(&config.journal_path)?;
    journal.schema_version = SESSION_SCHEMA_VERSION;
    journal.helper_pid = std::process::id();
    journal.mode = "launch".to_string();
    journal.status = "launching".to_string();
    write_journal(&config.journal_path, &journal)?;
    append_log(
        &config.log_path,
        format!("launch mode start sessionId={} exePath={}", journal.session_id, journal.exe_path),
    );

    let root_pid = match launch_game_process(&journal) {
        Ok(pid) => pid,
        Err(error) => {
            mark_failed(journal, &config.journal_path, error.to_string())?;
            return Err(error);
        }
    };

    bring_game_to_foreground_async(root_pid);

    let job_handle = create_job_object()?;
    let process_handle = open_process_for_job(root_pid)?;
    if let Err(error) = assign_root_to_job(job_handle, process_handle, root_pid) {
        unsafe {
            CloseHandle(process_handle);
            CloseHandle(job_handle);
        }
        mark_failed(journal, &config.journal_path, error.to_string())?;
        return Err(error);
    }
    unsafe {
        CloseHandle(process_handle);
    }

    journal.root_pid = root_pid;
    journal.status = "running".to_string();
    journal.last_heartbeat_at = now_ms();
    journal.accrued_ms = journal.last_heartbeat_at.saturating_sub(journal.started_at);
    write_journal(&config.journal_path, &journal)?;
    append_log(
        &config.log_path,
        format!("launch mode running sessionId={} rootPid={}", journal.session_id, root_pid),
    );

    let monitored = heartbeat_until_exit(journal, &config.journal_path, &config.log_path, || {
        job_has_processes(job_handle).or_else(|_| pid_tree_has_live_members(root_pid))
    })?;
    unsafe {
        CloseHandle(job_handle);
    }

    finalize_session(monitored, &config.journal_path, &config.db_path, &config.log_path)
}

#[cfg(not(windows))]
fn run_launch_mode(config: &HelperConfig) -> Result<()> {
    let mut journal = read_journal(&config.journal_path)?;
    journal.schema_version = SESSION_SCHEMA_VERSION;
    journal.helper_pid = std::process::id();
    journal.mode = "launch".to_string();
    journal.status = "launching".to_string();
    write_journal(&config.journal_path, &journal)?;
    append_log(
        &config.log_path,
        format!("launch mode start sessionId={} exePath={}", journal.session_id, journal.exe_path),
    );

    let root_pid = match launch_game_process(&journal) {
        Ok(pid) => pid,
        Err(error) => {
            mark_failed(journal, &config.journal_path, error.to_string())?;
            return Err(error);
        }
    };

    bring_game_to_foreground_async(root_pid);

    journal.root_pid = root_pid;
    journal.status = "running".to_string();
    journal.last_heartbeat_at = now_ms();
    journal.accrued_ms = journal.last_heartbeat_at.saturating_sub(journal.started_at);
    write_journal(&config.journal_path, &journal)?;
    append_log(
        &config.log_path,
        format!("launch mode running sessionId={} rootPid={}", journal.session_id, root_pid),
    );

    let monitored = heartbeat_until_exit(journal, &config.journal_path, &config.log_path, || {
        pid_tree_has_live_members(root_pid)
    })?;

    finalize_session(monitored, &config.journal_path, &config.db_path, &config.log_path)
}

fn run_attach_mode(config: &HelperConfig) -> Result<()> {
    let mut journal = read_journal(&config.journal_path)?;
    journal.schema_version = SESSION_SCHEMA_VERSION;
    journal.helper_pid = std::process::id();
    journal.mode = "attach".to_string();
    journal.status = "running".to_string();
    journal.last_heartbeat_at = now_ms();
    journal.accrued_ms = journal.last_heartbeat_at.saturating_sub(journal.started_at);
    write_journal(&config.journal_path, &journal)?;
    append_log(
        &config.log_path,
        format!("attach mode start sessionId={} rootPid={}", journal.session_id, journal.root_pid),
    );

    if journal.root_pid == 0 {
        let error = anyhow!("attach mode journal missing rootPid");
        mark_failed(journal, &config.journal_path, error.to_string())?;
        return Err(error);
    }

    let root_pid = journal.root_pid;
    let monitored = heartbeat_until_exit(journal, &config.journal_path, &config.log_path, || {
        pid_tree_has_live_members(root_pid)
    })?;

    finalize_session(monitored, &config.journal_path, &config.db_path, &config.log_path)
}

fn main() -> Result<()> {
    let config = parse_args()?;
    append_log(
        &config.log_path,
        format!(
            "helper start mode={} journal={} db={}",
            match config.mode {
                HelperMode::Launch => "launch",
                HelperMode::Attach => "attach",
            },
            config.journal_path.display(),
            config.db_path.display()
        ),
    );

    match config.mode {
        HelperMode::Launch => run_launch_mode(&config),
        HelperMode::Attach => run_attach_mode(&config),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_proc_stat_standard_line() {
        let line = "1234 (game.x86_64) S 1000 1234 1234 0 -1 4194304 100 0 0 0 10 5 0 0 20 0 1 0 1000";
        assert_eq!(parse_proc_stat_line(line), Some((1234, 1000)));
    }

    #[test]
    fn test_parse_proc_stat_with_spaces_in_comm() {
        let line = "5678 (My Cool Game) R 1234 5678 1234 0 -1";
        assert_eq!(parse_proc_stat_line(line), Some((5678, 1234)));
    }

    #[test]
    fn test_parse_proc_stat_with_nested_parentheses_in_comm() {
        let line = "9999 (steam_app (x86_64)) S 1 9999 1 0 -1";
        assert_eq!(parse_proc_stat_line(line), Some((9999, 1)));
    }

    #[test]
    fn test_parse_proc_stat_malformed_lines() {
        assert_eq!(parse_proc_stat_line(""), None);
        assert_eq!(parse_proc_stat_line("invalid content"), None);
        assert_eq!(parse_proc_stat_line("1234 no_parens S 1"), None);
        assert_eq!(parse_proc_stat_line("abc (comm) S 1"), None);
    }
}
