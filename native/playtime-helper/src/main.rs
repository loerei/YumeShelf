use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
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

static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

fn default_temp_path_generator(dest_path: &Path, _attempt: u32) -> PathBuf {
    let pid = std::process::id();
    let ts = now_ms();
    let cnt = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut temp_name = dest_path.as_os_str().to_os_string();
    temp_name.push(format!(".tmp.{}.{}_{}", pid, ts, cnt));
    PathBuf::from(temp_name)
}

pub fn write_atomic(dest_path: &Path, content: &str) -> Result<()> {
    write_atomic_impl(
        dest_path,
        content,
        default_temp_path_generator,
        |attempt| {
            let delay_ms = ((now_ms() ^ (attempt as u64)) % 5 + 1) * (attempt as u64 + 1);
            Duration::from_millis(delay_ms)
        },
    )
}

#[cfg(test)]
pub fn write_atomic_with_retry_config<G, D>(
    dest_path: &Path,
    content: &str,
    temp_path_gen: G,
    backoff: D,
) -> Result<()>
where
    G: FnMut(&Path, u32) -> PathBuf,
    D: FnMut(u32) -> Duration,
{
    write_atomic_impl(dest_path, content, temp_path_gen, backoff)
}

fn write_atomic_impl<G, D>(
    dest_path: &Path,
    content: &str,
    mut temp_path_gen: G,
    mut backoff: D,
) -> Result<()>
where
    G: FnMut(&Path, u32) -> PathBuf,
    D: FnMut(u32) -> Duration,
{
    if let Some(parent) = dest_path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create parent directories for {}", dest_path.display()))?;
        }
    }

    let mut opened: Option<(PathBuf, std::fs::File)> = None;

    for attempt in 0..10 {
        let candidate = temp_path_gen(dest_path, attempt);
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }

        match options.open(&candidate) {
            Ok(file) => {
                opened = Some((candidate, file));
                break;
            }
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
                let delay = backoff(attempt);
                if !delay.is_zero() {
                    thread::sleep(delay);
                }
                continue;
            }
            Err(err) => {
                return Err(anyhow::Error::from(err).context(format!(
                    "failed to create temporary file {} for {}",
                    candidate.display(),
                    dest_path.display()
                )));
            }
        }
    }

    let (temp_path, file) = match opened {
        Some(pair) => pair,
        None => {
            return Err(anyhow::Error::from(std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                "failed to create unique temporary file after 10 attempts",
            ))
            .context(format!(
                "failed to create temporary file for {}",
                dest_path.display()
            )));
        }
    };

    let write_and_sync = || -> Result<()> {
        let mut f = file;
        f.write_all(content.as_bytes())
            .with_context(|| format!("failed to write content to temp file {}", temp_path.display()))?;
        f.flush()
            .with_context(|| format!("failed to flush temp file {}", temp_path.display()))?;
        f.sync_all()
            .with_context(|| format!("failed to sync temp file {}", temp_path.display()))?;
        Ok(())
    };

    if let Err(err) = write_and_sync() {
        let _ = fs::remove_file(&temp_path);
        return Err(err);
    }

    if let Err(err) = fs::rename(&temp_path, dest_path) {
        let _ = fs::remove_file(&temp_path);
        return Err(anyhow::Error::from(err).context(format!(
            "failed to rename temp file {} to {}",
            temp_path.display(),
            dest_path.display()
        )));
    }

    Ok(())
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
    write_atomic(journal_path, &format!("{payload}\n"))
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
    write_atomic(db_path, &format!("{payload}\n"))
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

#[cfg(target_os = "macos")]
extern "C" {
    fn proc_listpids(type_: u32, typeinfo: u32, buffer: *mut libc::c_void, buffersize: i32) -> i32;
    fn proc_pidinfo(
        pid: libc::pid_t,
        flavor: i32,
        arg: u64,
        buffer: *mut libc::c_void,
        buffersize: i32,
    ) -> i32;
}

#[cfg(target_os = "macos")]
const PROC_ALL_PIDS: u32 = 1;
#[cfg(target_os = "macos")]
const PROC_PIDTASKALLINFO: i32 = 2;

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Copy, Clone)]
struct ProcBsdInfo {
    pbi_flags: u32,
    pbi_status: u32,
    pbi_xstatus: u32,
    pbi_pid: u32,
    pbi_ppid: u32,
    pbi_uid: u32,
    pbi_gid: u32,
    pbi_ruid: u32,
    pbi_rgid: u32,
    pbi_svuid: u32,
    pbi_svgid: u32,
    rfu_1: u32,
    pbi_comm: [u8; 16],
    pbi_name: [u8; 32],
    pbi_nfiles: u32,
    pbi_pgid: u32,
    pbi_pjobc: u32,
    pbi_e_unum: u32,
    pbi_e_pnum: u32,
    pbi_nice: i32,
    pbi_start_tvsec: u64,
    pbi_start_tvusec: u64,
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct ProcTaskAllInfo {
    pbsd: ProcBsdInfo,
    ptinfo: [u8; 192],
}

#[cfg(target_os = "macos")]
fn list_process_relations() -> Result<Vec<(u32, u32)>> {
    use std::mem::size_of;

    let mut capacity = 2048usize;
    let mut pids: Vec<libc::pid_t> = Vec::with_capacity(capacity);
    let mut num_pids = 0usize;

    loop {
        pids.resize(capacity, 0);
        let buffer_size = (capacity * size_of::<libc::pid_t>()) as i32;
        let bytes_written = unsafe {
            proc_listpids(
                PROC_ALL_PIDS,
                0,
                pids.as_mut_ptr() as *mut libc::c_void,
                buffer_size,
            )
        };

        if bytes_written <= 0 {
            return Ok(Vec::new());
        }

        let returned_count = (bytes_written as usize) / size_of::<libc::pid_t>();

        if bytes_written >= buffer_size {
            capacity = capacity.saturating_mul(2);
            if capacity > 65536 {
                num_pids = returned_count;
                pids.truncate(num_pids);
                break;
            }
            continue;
        }

        num_pids = returned_count;
        pids.truncate(num_pids);
        break;
    }

    let mut relations = Vec::with_capacity(num_pids);
    for &pid in &pids {
        if pid <= 0 {
            continue;
        }

        let mut info: ProcTaskAllInfo = unsafe { std::mem::zeroed() };
        let ret = unsafe {
            proc_pidinfo(
                pid,
                PROC_PIDTASKALLINFO,
                0,
                &mut info as *mut _ as *mut libc::c_void,
                size_of::<ProcTaskAllInfo>() as i32,
            )
        };

        if ret >= size_of::<ProcBsdInfo>() as i32 {
            relations.push((pid as u32, info.pbsd.pbi_ppid));
        }
    }

    Ok(relations)
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
fn list_process_relations() -> Result<Vec<(u32, u32)>> {
    Ok(Vec::new())
}

pub const MAX_TREE_DEPTH: usize = 128;

pub trait ProcessTreeProvider {
    fn get_children(&self, pid: u32) -> Vec<u32>;
    fn is_alive(&self, pid: u32) -> bool;
}

pub struct RelationsProcessTree {
    alive: HashSet<u32>,
    by_parent: HashMap<u32, Vec<u32>>,
}

impl RelationsProcessTree {
    pub fn new(relations: &[(u32, u32)]) -> Self {
        let mut alive: HashSet<u32> = HashSet::with_capacity(relations.len());
        let mut by_parent: HashMap<u32, Vec<u32>> = HashMap::with_capacity(relations.len());
        for &(pid, parent_pid) in relations {
            alive.insert(pid);
            by_parent.entry(parent_pid).or_default().push(pid);
        }
        Self { alive, by_parent }
    }
}

impl ProcessTreeProvider for RelationsProcessTree {
    fn get_children(&self, pid: u32) -> Vec<u32> {
        self.by_parent.get(&pid).cloned().unwrap_or_default()
    }

    fn is_alive(&self, pid: u32) -> bool {
        self.alive.contains(&pid)
    }
}

pub fn pid_tree_has_live_members_with_provider<P: ProcessTreeProvider>(
    root_pid: u32,
    provider: &P,
) -> bool {
    if root_pid == 0 {
        return false;
    }

    if provider.is_alive(root_pid) {
        return true;
    }

    let mut queue = VecDeque::from([(root_pid, 0usize)]);
    let mut visited = HashSet::new();

    while let Some((current_pid, depth)) = queue.pop_front() {
        if !visited.insert(current_pid) {
            continue;
        }

        if provider.is_alive(current_pid) {
            return true;
        }

        if depth >= MAX_TREE_DEPTH {
            continue;
        }

        for child_pid in provider.get_children(current_pid) {
            if !visited.contains(&child_pid) {
                queue.push_back((child_pid, depth + 1));
            }
        }
    }

    false
}

pub fn pid_tree_has_live_members_from_relations(root_pid: u32, relations: &[(u32, u32)]) -> bool {
    if root_pid == 0 || relations.is_empty() {
        return false;
    }
    let tree = RelationsProcessTree::new(relations);
    pid_tree_has_live_members_with_provider(root_pid, &tree)
}

pub fn get_pid_tree_members_from_relations(
    root_pid: u32,
    relations: &[(u32, u32)],
) -> HashSet<u32> {
    let mut members = HashSet::new();
    if root_pid == 0 || relations.is_empty() {
        return members;
    }

    let tree = RelationsProcessTree::new(relations);
    let mut queue = VecDeque::from([(root_pid, 0usize)]);
    let mut visited = HashSet::with_capacity(relations.len());

    while let Some((current_pid, depth)) = queue.pop_front() {
        if !visited.insert(current_pid) {
            continue;
        }

        if tree.is_alive(current_pid) {
            members.insert(current_pid);
        }

        if depth >= MAX_TREE_DEPTH {
            continue;
        }

        for child_pid in tree.get_children(current_pid) {
            if !visited.contains(&child_pid) {
                queue.push_back((child_pid, depth + 1));
            }
        }
    }

    members
}

fn pid_tree_has_live_members(root_pid: u32) -> Result<bool> {
    if root_pid == 0 {
        return Ok(false);
    }
    let relations = list_process_relations()?;
    Ok(pid_tree_has_live_members_from_relations(root_pid, &relations))
}

#[cfg(windows)]
fn get_pid_tree_members(root_pid: u32) -> Result<HashSet<u32>> {
    if root_pid == 0 {
        return Ok(HashSet::new());
    }
    let relations = list_process_relations()?;
    Ok(get_pid_tree_members_from_relations(root_pid, &relations))
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
    let config = match parse_args() {
        Ok(c) => c,
        Err(err) => {
            eprintln!("[playtime-helper][FATAL] argument parsing failed: {err:#}");
            return Err(err);
        }
    };

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

    let result = match config.mode {
        HelperMode::Launch => run_launch_mode(&config),
        HelperMode::Attach => run_attach_mode(&config),
    };

    if let Err(ref err) = result {
        append_log(
            &config.log_path,
            format!("helper terminated with runtime error: {err:#}"),
        );
    }

    result
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

    #[test]
    fn test_write_atomic_creates_file_and_parent_directories() {
        let temp_dir = std::env::temp_dir().join(format!(
            "yumeshelf_test_parent_{}_{}",
            now_ms(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let dest_path = temp_dir.join("nested").join("sub").join("data.json");

        assert!(!dest_path.parent().unwrap().exists());
        let res = write_atomic(&dest_path, "{\"success\": true}");
        assert!(res.is_ok());
        assert!(dest_path.exists());
        assert_eq!(
            fs::read_to_string(&dest_path).unwrap(),
            "{\"success\": true}"
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_write_atomic_overwrites_existing_file_durably() {
        let temp_dir = std::env::temp_dir().join(format!(
            "yumeshelf_test_overwrite_{}_{}",
            now_ms(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let dest_path = temp_dir.join("state.json");

        write_atomic(&dest_path, "initial").unwrap();
        assert_eq!(fs::read_to_string(&dest_path).unwrap(), "initial");

        write_atomic(&dest_path, "overwritten").unwrap();
        assert_eq!(fs::read_to_string(&dest_path).unwrap(), "overwritten");

        let entries: Vec<_> = fs::read_dir(&temp_dir)
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].to_str().unwrap(), "state.json");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_write_atomic_collision_retry_success() {
        let temp_dir = std::env::temp_dir().join(format!(
            "yumeshelf_test_retry_{}_{}",
            now_ms(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let dest_path = temp_dir.join("dest.json");

        let col0 = temp_dir.join("col_0.tmp");
        let col1 = temp_dir.join("col_1.tmp");
        let col2 = temp_dir.join("col_2.tmp");
        let candidate3 = temp_dir.join("col_3.tmp");

        fs::write(&col0, "occupied 0").unwrap();
        fs::write(&col1, "occupied 1").unwrap();
        fs::write(&col2, "occupied 2").unwrap();

        let mut attempt_count = 0;
        let res = write_atomic_with_retry_config(
            &dest_path,
            "atomic content",
            |_dest, attempt| {
                attempt_count += 1;
                match attempt {
                    0 => col0.clone(),
                    1 => col1.clone(),
                    2 => col2.clone(),
                    _ => candidate3.clone(),
                }
            },
            |_attempt| Duration::from_millis(0),
        );

        assert!(res.is_ok());
        assert_eq!(attempt_count, 4);
        assert_eq!(fs::read_to_string(&dest_path).unwrap(), "atomic content");
        assert!(!candidate3.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_write_atomic_collision_exhaustion_cleans_up_and_errors() {
        let temp_dir = std::env::temp_dir().join(format!(
            "yumeshelf_test_exhaust_{}_{}",
            now_ms(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let dest_path = temp_dir.join("dest.json");

        let mut collision_files = Vec::new();
        for i in 0..10 {
            let p = temp_dir.join(format!("col_{}.tmp", i));
            fs::write(&p, format!("occupied {}", i)).unwrap();
            collision_files.push(p);
        }

        let mut attempt_count = 0;
        let res = write_atomic_with_retry_config(
            &dest_path,
            "should fail",
            |_dest, attempt| {
                attempt_count += 1;
                collision_files[attempt as usize % 10].clone()
            },
            |_attempt| Duration::from_millis(0),
        );

        assert!(res.is_err());
        assert_eq!(attempt_count, 10);
        let err_str = format!("{:#}", res.unwrap_err());
        assert!(err_str.contains("failed to create unique temporary file after 10 attempts"));
        assert!(!dest_path.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_write_atomic_cleans_up_temp_on_failure() {
        let temp_dir = std::env::temp_dir().join(format!(
            "yumeshelf_test_cleanup_{}_{}",
            now_ms(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&temp_dir).unwrap();

        // Create a directory where the destination file is expected to be; rename will fail
        let invalid_dest = temp_dir.join("existing_dir");
        fs::create_dir_all(&invalid_dest).unwrap();

        let temp_candidate = temp_dir.join("test_temp_candidate.tmp");
        let candidate_clone = temp_candidate.clone();

        let res = write_atomic_with_retry_config(
            &invalid_dest,
            "content",
            move |_dest, _attempt| candidate_clone.clone(),
            |_attempt| Duration::from_millis(0),
        );

        assert!(res.is_err());
        assert!(!temp_candidate.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[cfg(unix)]
    #[test]
    fn test_write_atomic_unix_permissions_mode_0o600() {
        use std::os::unix::fs::PermissionsExt;
        let temp_dir = std::env::temp_dir().join(format!(
            "yumeshelf_test_perm_{}_{}",
            now_ms(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let file_path = temp_dir.join("secret.json");
        write_atomic(&file_path, "{\"secret\": true}").unwrap();
        let metadata = fs::metadata(&file_path).unwrap();
        let permissions = metadata.permissions();
        assert_eq!(permissions.mode() & 0o777, 0o600);
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_write_journal_and_update_db_finalize_use_write_atomic() {
        let temp_dir = std::env::temp_dir().join(format!(
            "yumeshelf_test_db_{}_{}",
            now_ms(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let db_path = temp_dir.join("library.json");
        let journal_path = temp_dir.join("session.journal.json");

        let initial_db = r#"{
            "games": {
                "game-123": {
                    "title": "Test Game",
                    "playtime": 1000,
                    "lastPlayed": 500
                }
            }
        }"#;
        write_atomic(&db_path, initial_db).unwrap();

        update_db_finalize(&db_path, "game-123", 4000, 10000).unwrap();

        let updated_content = fs::read_to_string(&db_path).unwrap();
        let val: Value = serde_json::from_str(&updated_content).unwrap();
        assert_eq!(val["games"]["game-123"]["playtime"], 5000);
        assert_eq!(val["games"]["game-123"]["lastPlayed"], 10000);

        let journal = SessionJournal {
            schema_version: 1,
            session_id: "sess-1".to_string(),
            game_key: "game-123".to_string(),
            exe_path: "game.exe".to_string(),
            cwd: ".".to_string(),
            mode: "launch".to_string(),
            helper_pid: 111,
            root_pid: 222,
            started_at: 1000,
            last_heartbeat_at: 2000,
            accrued_ms: 1000,
            status: "running".to_string(),
            ended_at: None,
            failure_reason: None,
            runner: None,
            runner_args: None,
            env: None,
        };

        write_journal(&journal_path, &journal).unwrap();
        let read_back = read_journal(&journal_path).unwrap();
        assert_eq!(read_back.session_id, "sess-1");
        assert_eq!(read_back.game_key, "game-123");
        assert_eq!(read_back.accrued_ms, 1000);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_process_tree_empty_and_zero_root() {
        assert!(!pid_tree_has_live_members_from_relations(0, &[]));
        assert!(!pid_tree_has_live_members_from_relations(0, &[(100, 0)]));
        assert!(!pid_tree_has_live_members_from_relations(100, &[]));
        assert!(get_pid_tree_members_from_relations(0, &[]).is_empty());
        assert!(get_pid_tree_members_from_relations(100, &[]).is_empty());
    }

    #[test]
    fn test_process_tree_root_alive() {
        let relations = vec![(100, 1), (101, 100)];
        assert!(pid_tree_has_live_members_from_relations(100, &relations));
        let members = get_pid_tree_members_from_relations(100, &relations);
        assert!(members.contains(&100));
        assert!(members.contains(&101));
    }

    #[test]
    fn test_process_tree_launcher_exited_child_alive() {
        // Root launcher (PID 100) has terminated and is not in relations, but child (PID 200) is running
        let relations = vec![(200, 100), (201, 200)];
        assert!(pid_tree_has_live_members_from_relations(100, &relations));
        let members = get_pid_tree_members_from_relations(100, &relations);
        assert!(!members.contains(&100));
        assert!(members.contains(&200));
        assert!(members.contains(&201));
    }

    #[test]
    fn test_process_tree_branching_and_diamond_dependencies() {
        // Root 10 spawns 20 and 30, both spawn 40 (diamond)
        let relations = vec![(20, 10), (30, 10), (40, 20), (40, 30)];
        assert!(pid_tree_has_live_members_from_relations(10, &relations));
        let members = get_pid_tree_members_from_relations(10, &relations);
        assert_eq!(members.len(), 3);
        assert!(members.contains(&20));
        assert!(members.contains(&30));
        assert!(members.contains(&40));
    }

    #[test]
    fn test_process_tree_orphaned_and_unrelated_pids() {
        let relations = vec![(500, 1), (501, 500), (600, 2)];
        assert!(!pid_tree_has_live_members_from_relations(100, &relations));
        assert!(get_pid_tree_members_from_relations(100, &relations).is_empty());
    }

    #[test]
    fn test_process_tree_cyclic_relations_terminates_cleanly() {
        // Cyclic graph: 100 -> 200 -> 300 -> 100
        let relations = vec![(100, 300), (200, 100), (300, 200)];
        assert!(pid_tree_has_live_members_from_relations(100, &relations));
        let members = get_pid_tree_members_from_relations(100, &relations);
        assert_eq!(members.len(), 3);

        // Cyclic graph disconnected from root
        let disconnected_relations = vec![(200, 300), (300, 200)];
        assert!(!pid_tree_has_live_members_from_relations(100, &disconnected_relations));
    }

    #[test]
    fn test_process_tree_deep_hierarchy_and_depth_limiting() {
        // Chain of 150 processes: 2 is child of 1, 3 is child of 2, etc.
        let mut relations = Vec::new();
        for i in 2..=150 {
            relations.push((i, i - 1));
        }

        // Live tree from root 1 (where 1 is not alive, but children are)
        assert!(pid_tree_has_live_members_from_relations(1, &relations));
        let members = get_pid_tree_members_from_relations(1, &relations);
        // Traversal is capped at MAX_TREE_DEPTH = 128 from root 1
        assert!(members.contains(&2));
        assert!(members.contains(&128));
        assert!(!members.contains(&135));
    }

    struct MockProcessTree {
        alive_pids: HashSet<u32>,
        children_map: HashMap<u32, Vec<u32>>,
    }

    impl ProcessTreeProvider for MockProcessTree {
        fn get_children(&self, pid: u32) -> Vec<u32> {
            self.children_map.get(&pid).cloned().unwrap_or_default()
        }

        fn is_alive(&self, pid: u32) -> bool {
            self.alive_pids.contains(&pid)
        }
    }

    #[test]
    fn test_process_tree_custom_provider_trait() {
        let mut alive_pids = HashSet::new();
        alive_pids.insert(300);

        let mut children_map = HashMap::new();
        children_map.insert(100, vec![200]);
        children_map.insert(200, vec![300]);

        let mock = MockProcessTree {
            alive_pids,
            children_map,
        };

        assert!(pid_tree_has_live_members_with_provider(100, &mock));
        assert!(!pid_tree_has_live_members_with_provider(500, &mock));
        assert!(!pid_tree_has_live_members_with_provider(0, &mock));
    }
}
