import type { FileSystemProvider, GameEngineProfile, ResolvedSaveLocation } from '../types.js';
import { dirName, getExeStem, joinPaths } from './path-utils.js';
import {
  isDirectory,
  rankSaveCandidates,
  scanDirectoryForSaveFiles,
  type SaveCandidate,
} from './heuristics.js';

export const RPG_MAKER_MV_MZ_PATTERNS = /\.(rpgsave|rmmvsave|rmmzsave|json)$/i;
export const RPG_MAKER_RGSS_PATTERNS = /\.(rvdata2|rvdata|rxdata|lsd)$/i;
export const RENPY_PATTERNS = /(\.(save|rpyc)$|^persistent)/i;
export const UNREAL_PATTERNS = /\.sav$/i;
export const WOLF_PATTERNS = /\.sav$/i;
export const GODOT_PATTERNS = /\.(sav|save|dat|bin|json)$/i;
export const KIRIKIRI_PATTERNS = /\.(ksd|dat|asd|sav)$/i;

// --- RPG Maker ---
export async function resolveRpgMakerSave(
  exeDir: string,
  profile: GameEngineProfile | undefined,
  fs: FileSystemProvider
): Promise<ResolvedSaveLocation | null> {
  const isRGSS = profile?.family === 'rpg-maker' && ['vx-ace', 'vx', 'xp', '2000-2003'].includes(profile.variant || '');
  
  if (isRGSS) {
    const candidates: SaveCandidate[] = [
      { path: joinPaths(exeDir, 'Save'), confidence: 'high', source: 'deterministic', matchedStrategy: 'rpg-maker-rgss' },
      { path: joinPaths(exeDir, 'save'), confidence: 'high', source: 'deterministic', matchedStrategy: 'rpg-maker-rgss' },
    ];

    // Check root directory for Save*.rvdata2 / Save*.rxdata / Save*.lsd
    const rootFiles = await scanDirectoryForSaveFiles(exeDir, fs, RPG_MAKER_RGSS_PATTERNS);
    if (rootFiles.some((f) => /^save/i.test(f))) {
      candidates.push({
        path: exeDir,
        confidence: 'high',
        source: 'deterministic',
        matchedStrategy: 'rpg-maker-rgss',
        files: rootFiles,
      });
    }

    const ranked = await rankSaveCandidates(candidates, fs, RPG_MAKER_RGSS_PATTERNS);
    if (ranked) return ranked;

    return null;
  }

  // RPG Maker MV / MZ
  const candidates: SaveCandidate[] = [
    { path: joinPaths(exeDir, 'www', 'save'), confidence: 'high', source: 'deterministic', matchedStrategy: 'rpg-maker-mv-mz' },
    { path: joinPaths(exeDir, 'save'), confidence: 'high', source: 'deterministic', matchedStrategy: 'rpg-maker-mv-mz' },
    { path: joinPaths(exeDir, 'Save'), confidence: 'high', source: 'deterministic', matchedStrategy: 'rpg-maker-mv-mz' },
    { path: joinPaths(exeDir, 'bin', 'www', 'save'), confidence: 'high', source: 'deterministic', matchedStrategy: 'rpg-maker-mv-mz' },
    { path: joinPaths(exeDir, 'bin', 'save'), confidence: 'high', source: 'deterministic', matchedStrategy: 'rpg-maker-mv-mz' },
  ];

  const ranked = await rankSaveCandidates(candidates, fs, RPG_MAKER_MV_MZ_PATTERNS);
  if (ranked) return ranked;

  // Predicted path fallback for unlaunched games
  if (await fs.exists(joinPaths(exeDir, 'bin', 'www'))) {
    return {
      path: joinPaths(exeDir, 'bin', 'www', 'save'),
      confidence: 'high',
      source: 'deterministic',
      matchedStrategy: 'rpg-maker-mv-mz',
      files: [],
    };
  }
  if (await fs.exists(joinPaths(exeDir, 'www'))) {
    return {
      path: joinPaths(exeDir, 'www', 'save'),
      confidence: 'high',
      source: 'deterministic',
      matchedStrategy: 'rpg-maker-mv-mz',
      files: [],
    };
  }
  if (await fs.exists(joinPaths(exeDir, 'data'))) {
    return {
      path: joinPaths(exeDir, 'save'),
      confidence: 'high',
      source: 'deterministic',
      matchedStrategy: 'rpg-maker-mv-mz',
      files: [],
    };
  }

  return null;
}

// --- Ren'Py ---
export async function resolveRenPySave(
  exeDir: string,
  exeStem: string,
  fs: FileSystemProvider
): Promise<ResolvedSaveLocation | null> {
  const candidates: SaveCandidate[] = [
    { path: joinPaths(exeDir, 'game', 'saves'), confidence: 'high', source: 'deterministic', matchedStrategy: 'renpy-pickle' },
    { path: joinPaths(exeDir, 'saves'), confidence: 'high', source: 'deterministic', matchedStrategy: 'renpy-pickle' },
    { path: joinPaths(exeDir, 'game', 'save'), confidence: 'high', source: 'deterministic', matchedStrategy: 'renpy-pickle' },
  ];

  const candidateRoots = new Set<string>();

  // 1. Windows APPDATA
  const appData = fs.getAppDataPath();
  if (appData) {
    candidateRoots.add(joinPaths(appData, 'RenPy'));
  }

  // 2. Linux XDG / Home directories
  const userProfile = fs.getUserProfilePath();
  if (userProfile) {
    candidateRoots.add(joinPaths(userProfile, '.renpy'));
    candidateRoots.add(joinPaths(userProfile, '.local', 'share', 'renpy'));
  }
  if (fs.getXdgDataHome) {
    candidateRoots.add(joinPaths(fs.getXdgDataHome(), 'renpy'));
  }

  // 3. Wine / Proton prefixes
  if (fs.getWinePrefixRoots && fs.getWineAppDataPaths) {
    try {
      const winePrefixes = await fs.getWinePrefixRoots(exeDir);
      for (const prefix of winePrefixes) {
        const roamingPaths = await fs.getWineAppDataPaths(prefix, 'Roaming');
        for (const roaming of roamingPaths) {
          candidateRoots.add(joinPaths(roaming, 'RenPy'));
        }
      }
    } catch {
      // ignore prefix discovery errors
    }
  }

  for (const renpySaveRoot of candidateRoots) {
    try {
      if (!(await fs.exists(renpySaveRoot))) continue;
      const entries = await fs.readdir(renpySaveRoot);

      // Exact prefix match: GameName-1234567890
      const match = entries.find((entry) => {
        const normalized = entry.toLowerCase().split('-')[0];
        return normalized === exeStem.toLowerCase();
      });
      if (match) {
        candidates.push({
          path: joinPaths(renpySaveRoot, match),
          confidence: 'high',
          source: renpySaveRoot.includes('.wine') || renpySaveRoot.includes('pfx') ? 'wine' : 'appdata',
          matchedStrategy: 'renpy-pickle',
        });
      }

      // Fuzzy match
      const fuzzyMatch = entries.find(
        (entry) => entry.toLowerCase().includes(exeStem.toLowerCase()) && exeStem.length >= 4
      );
      if (fuzzyMatch && fuzzyMatch !== match) {
        candidates.push({
          path: joinPaths(renpySaveRoot, fuzzyMatch),
          confidence: 'medium',
          source: renpySaveRoot.includes('.wine') || renpySaveRoot.includes('pfx') ? 'wine' : 'appdata',
          matchedStrategy: 'renpy-pickle',
        });
      }
    } catch {
      // ignore
    }
  }

  return rankSaveCandidates(candidates, fs, RENPY_PATTERNS);
}

// --- Unity ---
async function resolveUnityFromAppInfo(
  exeDir: string,
  dataFolder: string,
  candidateRoots: Iterable<string>,
  fs: FileSystemProvider
): Promise<SaveCandidate | null> {
  const appInfoPath = joinPaths(exeDir, dataFolder, 'app.info');
  if (!(await fs.exists(appInfoPath))) return null;

  try {
    const raw = await fs.readFile(appInfoPath, 'utf-8');
    const content = typeof raw === 'string' ? raw : raw.toString('utf-8');
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      const company = lines[0];
      const product = lines[1];

      for (const root of candidateRoots) {
        const savePath = joinPaths(root, company, product);
        if (await fs.exists(savePath)) {
          return {
            path: savePath,
            confidence: 'high',
            source: root.includes('.wine') || root.includes('pfx') ? 'wine' : 'appdata',
            matchedStrategy: 'unity',
          };
        }
      }

      const primaryRoot = Array.from(candidateRoots)[0];
      if (primaryRoot) {
        return {
          path: joinPaths(primaryRoot, company, product),
          confidence: 'high',
          source: primaryRoot.includes('.wine') || primaryRoot.includes('pfx') ? 'wine' : 'appdata',
          matchedStrategy: 'unity',
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function resolveUnitySave(
  exeDir: string,
  exeStem: string,
  fs: FileSystemProvider
): Promise<ResolvedSaveLocation | null> {
  const candidates: SaveCandidate[] = [
    { path: joinPaths(exeDir, 'Saves'), confidence: 'high', source: 'deterministic', matchedStrategy: 'unity' },
    { path: joinPaths(exeDir, 'saves'), confidence: 'high', source: 'deterministic', matchedStrategy: 'unity' },
    { path: joinPaths(exeDir, 'save'), confidence: 'high', source: 'deterministic', matchedStrategy: 'unity' },
    { path: joinPaths(exeDir, 'SaveData'), confidence: 'high', source: 'deterministic', matchedStrategy: 'unity' },
    { path: joinPaths(exeDir, 'save_data'), confidence: 'high', source: 'deterministic', matchedStrategy: 'unity' },
  ];

  // Check Data folders and portable StreamingAssets / Naninovel saves
  try {
    const dirEntries = await fs.readdir(exeDir);
    const dataFolders = dirEntries.filter((entry) => entry.toLowerCase().endsWith('_data'));
    for (const df of dataFolders) {
      const dataPath = joinPaths(exeDir, df);
      candidates.push(
        { path: joinPaths(dataPath, 'StreamingAssets', 'SaveData'), confidence: 'high', source: 'deterministic', matchedStrategy: 'unity' },
        { path: joinPaths(dataPath, 'StreamingAssets', 'NaninovelData'), confidence: 'high', source: 'deterministic', matchedStrategy: 'unity' },
        { path: joinPaths(dataPath, 'StreamingAssets', 'NaninovelData', 'NaniSaves'), confidence: 'high', source: 'deterministic', matchedStrategy: 'unity' },
        { path: joinPaths(dataPath, 'StreamingAssets', 'saves'), confidence: 'high', source: 'deterministic', matchedStrategy: 'unity' },
        { path: joinPaths(dataPath, 'SaveData'), confidence: 'high', source: 'deterministic', matchedStrategy: 'unity' },
        { path: joinPaths(dataPath, 'saves'), confidence: 'high', source: 'deterministic', matchedStrategy: 'unity' }
      );
    }
  } catch {
    // ignore
  }

  const candidateRoots = new Set<string>();

  // 1. Windows LocalLow
  const userProfile = fs.getUserProfilePath();
  if (userProfile) {
    candidateRoots.add(joinPaths(userProfile, 'AppData', 'LocalLow'));
  }

  // 2. Linux XDG / Home unity3d directories
  if (fs.getXdgConfigHome) {
    candidateRoots.add(joinPaths(fs.getXdgConfigHome(), 'unity3d'));
  }
  if (userProfile) {
    candidateRoots.add(joinPaths(userProfile, '.config', 'unity3d'));
  }

  // 3. Wine / Proton prefixes
  if (fs.getWinePrefixRoots && fs.getWineAppDataPaths) {
    try {
      const winePrefixes = await fs.getWinePrefixRoots(exeDir);
      for (const prefix of winePrefixes) {
        const localLowPaths = await fs.getWineAppDataPaths(prefix, 'LocalLow');
        for (const localLow of localLowPaths) {
          candidateRoots.add(localLow);
        }
      }
    } catch {
      // ignore prefix errors
    }
  }

  try {
    const dirEntries = await fs.readdir(exeDir);
    const dataFolders = dirEntries.filter((entry) => entry.toLowerCase().endsWith('_data'));
    for (const dataFolder of dataFolders) {
      const appInfoCandidate = await resolveUnityFromAppInfo(exeDir, dataFolder, candidateRoots, fs);
      if (appInfoCandidate) {
        candidates.push(appInfoCandidate);
      }

      const productName = dataFolder.replace(/_Data$/i, '');
      for (const root of candidateRoots) {
        try {
          if (!(await fs.exists(root))) continue;
          const companyEntries = await fs.readdir(root);
          for (const companyDir of companyEntries) {
            const productPath = joinPaths(root, companyDir, productName);
            candidates.push({
              path: productPath,
              confidence: 'medium',
              source: root.includes('.wine') || root.includes('pfx') ? 'wine' : 'appdata',
              matchedStrategy: 'unity',
            });
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  return rankSaveCandidates(candidates, fs);
}

// --- Unreal Engine ---
export async function resolveUnrealSave(
  exeDir: string,
  exeStem: string,
  fs: FileSystemProvider
): Promise<ResolvedSaveLocation | null> {
  const candidateRoots = new Set<string>();

  // 1. Windows LOCALAPPDATA
  const localAppData = fs.getLocalAppDataPath();
  if (localAppData) {
    candidateRoots.add(localAppData);
  }

  // 2. Linux XDG directories
  if (fs.getXdgConfigHome) {
    candidateRoots.add(joinPaths(fs.getXdgConfigHome(), 'Epic'));
  }
  if (fs.getXdgDataHome) {
    candidateRoots.add(fs.getXdgDataHome());
  }

  // 3. Wine / Proton prefixes
  if (fs.getWinePrefixRoots && fs.getWineAppDataPaths) {
    try {
      const winePrefixes = await fs.getWinePrefixRoots(exeDir);
      for (const prefix of winePrefixes) {
        const localPaths = await fs.getWineAppDataPaths(prefix, 'Local');
        for (const local of localPaths) {
          candidateRoots.add(local);
        }
      }
    } catch {
      // ignore
    }
  }

  const projectNames = new Set<string>();
  if (exeStem && !/^(game|launcher|start|app|shipping)$/i.test(exeStem)) {
    projectNames.add(exeStem);
  }

  try {
    const entries = await fs.readdir(exeDir);
    for (const e of entries) {
      const subContent = joinPaths(exeDir, e, 'Content');
      const subBinaries = joinPaths(exeDir, e, 'Binaries');
      if ((await fs.exists(subContent)) || (await fs.exists(subBinaries))) {
        projectNames.add(e);
      }
    }
  } catch {
    // ignore
  }

  const stemDir = getExeStem(exeDir);
  if (stemDir && !/^(game|launcher|start|app|binaries|win64|win32|linux)$/i.test(stemDir)) {
    projectNames.add(stemDir);
  }

  const candidates: SaveCandidate[] = [
    { path: joinPaths(exeDir, 'Saved', 'SaveGames'), confidence: 'high', source: 'deterministic', matchedStrategy: 'unreal-sav' }
  ];

  for (const proj of projectNames) {
    candidates.push({
      path: joinPaths(exeDir, proj, 'Saved', 'SaveGames'),
      confidence: 'high',
      source: 'deterministic',
      matchedStrategy: 'unreal-sav',
    });
  }

  for (const root of candidateRoots) {
    for (const proj of projectNames) {
      candidates.push({
        path: joinPaths(root, proj, 'Saved', 'SaveGames'),
        confidence: 'high',
        source: root.includes('.wine') || root.includes('pfx') ? 'wine' : 'appdata',
        matchedStrategy: 'unreal-sav',
      });
    }
  }

  const ranked = await rankSaveCandidates(candidates, fs, UNREAL_PATTERNS);
  if (ranked) return ranked;

  // Predicted path fallback
  const primaryProj = Array.from(projectNames)[0];
  const primaryRoot = Array.from(candidateRoots)[0];
  if (primaryProj && primaryRoot) {
    return {
      path: joinPaths(primaryRoot, primaryProj, 'Saved', 'SaveGames'),
      confidence: 'high',
      source: 'deterministic',
      matchedStrategy: 'unreal-sav',
      files: [],
    };
  }

  return null;
}

// --- Wolf RPG Editor ---
export async function resolveWolfRpgSave(
  exeDir: string,
  fs: FileSystemProvider
): Promise<ResolvedSaveLocation | null> {
  const candidates: SaveCandidate[] = [
    { path: joinPaths(exeDir, 'Save'), confidence: 'high', source: 'deterministic', matchedStrategy: 'wolf-sav' },
    { path: joinPaths(exeDir, 'save'), confidence: 'high', source: 'deterministic', matchedStrategy: 'wolf-sav' },
    { path: joinPaths(exeDir, 'SaveData'), confidence: 'high', source: 'deterministic', matchedStrategy: 'wolf-sav' },
    { path: joinPaths(exeDir, 'savedata'), confidence: 'high', source: 'deterministic', matchedStrategy: 'wolf-sav' },
  ];

  const rootFiles = await scanDirectoryForSaveFiles(exeDir, fs, WOLF_PATTERNS);
  if (rootFiles.length > 0) {
    candidates.push({
      path: exeDir,
      confidence: 'high',
      source: 'deterministic',
      matchedStrategy: 'wolf-sav',
      files: rootFiles,
    });
  }

  const ranked = await rankSaveCandidates(candidates, fs, WOLF_PATTERNS);
  if (ranked) return ranked;

  return {
    path: joinPaths(exeDir, 'Save'),
    confidence: 'high',
    source: 'deterministic',
    matchedStrategy: 'wolf-sav',
    files: [],
  };
}

// --- Godot Engine ---
export async function resolveGodotSave(
  exeDir: string,
  exeStem: string,
  fs: FileSystemProvider
): Promise<ResolvedSaveLocation | null> {
  const candidates: SaveCandidate[] = [
    { path: joinPaths(exeDir, 'save'), confidence: 'high', source: 'deterministic', matchedStrategy: 'godot' },
    { path: joinPaths(exeDir, 'saves'), confidence: 'high', source: 'deterministic', matchedStrategy: 'godot' },
    { path: joinPaths(exeDir, 'savedata'), confidence: 'high', source: 'deterministic', matchedStrategy: 'godot' },
  ];

  const candidatePaths = new Set<string>();

  // 1. Windows APPDATA
  const appData = fs.getAppDataPath();
  if (appData) {
    candidatePaths.add(joinPaths(appData, 'Godot', 'app_userdata', exeStem));
  }

  // 2. Linux XDG / Home directories
  const userProfile = fs.getUserProfilePath();
  if (userProfile) {
    candidatePaths.add(joinPaths(userProfile, '.local', 'share', 'godot', 'app_userdata', exeStem));
  }
  if (fs.getXdgDataHome) {
    candidatePaths.add(joinPaths(fs.getXdgDataHome(), 'godot', 'app_userdata', exeStem));
  }
  if (fs.getXdgConfigHome) {
    candidatePaths.add(joinPaths(fs.getXdgConfigHome(), 'godot', 'app_userdata', exeStem));
  }

  // 3. Wine / Proton prefixes
  if (fs.getWinePrefixRoots && fs.getWineAppDataPaths) {
    try {
      const winePrefixes = await fs.getWinePrefixRoots(exeDir);
      for (const prefix of winePrefixes) {
        const roamingPaths = await fs.getWineAppDataPaths(prefix, 'Roaming');
        for (const roaming of roamingPaths) {
          candidatePaths.add(joinPaths(roaming, 'Godot', 'app_userdata', exeStem));
        }
      }
    } catch {
      // ignore
    }
  }

  for (const godotUserDir of candidatePaths) {
    candidates.push({
      path: godotUserDir,
      confidence: 'high',
      source: godotUserDir.includes('.wine') || godotUserDir.includes('pfx') ? 'wine' : 'appdata',
      matchedStrategy: 'godot',
    });
  }

  return rankSaveCandidates(candidates, fs, GODOT_PATTERNS);
}

// --- Flash / AIR ---
export async function resolveFlashSave(
  exeDir: string,
  exeStem: string,
  fs: FileSystemProvider
): Promise<ResolvedSaveLocation | null> {
  const appData = fs.getAppDataPath();
  if (!appData) return null;

  const flashObjectsRoot = joinPaths(appData, 'Macromedia', 'Flash Player', '#SharedObjects');
  if (await fs.exists(flashObjectsRoot)) {
    try {
      const identifiers = new Set<string>();
      if (exeStem) identifiers.add(exeStem.toLowerCase());
      try {
        const dirFiles = await fs.readdir(exeDir);
        for (const df of dirFiles) {
          if (df.toLowerCase().endsWith('.swf')) {
            identifiers.add(df.replace(/\.swf$/i, '').toLowerCase());
          }
        }
      } catch {
        // ignore
      }

      const allSolDirs: string[] = [];
      async function scanDir(dir: string, depth = 0): Promise<void> {
        if (depth > 4) return;
        try {
          const entries = await fs.readdir(dir);
          for (const e of entries) {
            const full = joinPaths(dir, e);
            if (await isDirectory(full, fs)) {
              const subFiles = await fs.readdir(full).catch(() => []);
              if (subFiles.some((f) => f.toLowerCase().endsWith('.sol'))) {
                allSolDirs.push(full);
              }
              await scanDir(full, depth + 1);
            }
          }
        } catch {
          // ignore
        }
      }

      await scanDir(flashObjectsRoot);

      for (const solDir of allSolDirs) {
        const lower = solDir.toLowerCase();
        for (const id of identifiers) {
          if (id && id.length > 2 && lower.includes(id)) {
            const files = await scanDirectoryForSaveFiles(solDir, fs, /\.sol$/i);
            return {
              path: solDir,
              confidence: 'high',
              source: 'deterministic',
              matchedStrategy: 'flash-sol',
              files,
            };
          }
        }
        const subFiles = await fs.readdir(solDir).catch(() => []);
        for (const sf of subFiles) {
          const sfLower = sf.toLowerCase();
          for (const id of identifiers) {
            if (id && id.length > 2 && sfLower.includes(id)) {
              const files = await scanDirectoryForSaveFiles(solDir, fs, /\.sol$/i);
              return {
                path: solDir,
                confidence: 'high',
                source: 'deterministic',
                matchedStrategy: 'flash-sol',
                files,
              };
            }
          }
        }
      }

      if (allSolDirs.length === 1) {
        const files = await scanDirectoryForSaveFiles(allSolDirs[0], fs, /\.sol$/i);
        return {
          path: allSolDirs[0],
          confidence: 'high',
          source: 'deterministic',
          matchedStrategy: 'flash-sol',
          files,
        };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

// --- TyranoBuilder ---
export async function resolveTyranoBuilderSave(
  exeDir: string,
  fs: FileSystemProvider
): Promise<ResolvedSaveLocation | null> {
  const saveDir = joinPaths(exeDir, 'tyrano', 'savedata');
  if (await fs.exists(saveDir)) {
    const files = await scanDirectoryForSaveFiles(saveDir, fs);
    return {
      path: saveDir,
      confidence: 'high',
      source: 'deterministic',
      matchedStrategy: 'tyranobuilder',
      files,
    };
  }
  return null;
}

// --- GameMaker ---
export async function resolveGameMakerSave(
  exeDir: string,
  exeStem: string,
  fs: FileSystemProvider
): Promise<ResolvedSaveLocation | null> {
  const localAppData = fs.getLocalAppDataPath();
  if (!localAppData) return null;

  const sanitizedStem = exeStem.replace(/\W/g, '_');
  const candidates: SaveCandidate[] = [
    { path: joinPaths(localAppData, sanitizedStem), confidence: 'high', source: 'deterministic', matchedStrategy: 'gamemaker-appdata' },
    { path: joinPaths(localAppData, exeStem), confidence: 'high', source: 'deterministic', matchedStrategy: 'gamemaker-appdata' },
  ];

  const ranked = await rankSaveCandidates(candidates, fs);
  if (ranked) return ranked;

  return {
    path: joinPaths(localAppData, sanitizedStem),
    confidence: 'high',
    source: 'deterministic',
    matchedStrategy: 'gamemaker-appdata',
    files: [],
  };
}

// --- RPG Bakin ---
export async function resolveBakinSave(
  exeDir: string,
  fs: FileSystemProvider
): Promise<ResolvedSaveLocation | null> {
  const candidates: SaveCandidate[] = [
    { path: joinPaths(exeDir, 'data', 'savedata'), confidence: 'high', source: 'deterministic', matchedStrategy: 'bakin' },
    { path: joinPaths(exeDir, 'savedata'), confidence: 'high', source: 'deterministic', matchedStrategy: 'bakin' },
  ];

  return rankSaveCandidates(candidates, fs);
}

// --- KiriKiri 2 / Z ---
export async function resolveKirikiriSave(
  exeDir: string,
  exeStem: string,
  fs: FileSystemProvider
): Promise<ResolvedSaveLocation | null> {
  const candidates: SaveCandidate[] = [
    { path: joinPaths(exeDir, 'savedata'), confidence: 'high', source: 'deterministic', matchedStrategy: 'kirikiri' },
    { path: joinPaths(exeDir, 'SaveData'), confidence: 'high', source: 'deterministic', matchedStrategy: 'kirikiri' },
    { path: joinPaths(exeDir, 'save'), confidence: 'high', source: 'deterministic', matchedStrategy: 'kirikiri' },
  ];

  const appData = fs.getAppDataPath();
  if (appData) {
    candidates.push({
      path: joinPaths(appData, exeStem, 'savedata'),
      confidence: 'medium',
      source: 'appdata',
      matchedStrategy: 'kirikiri',
    });
  }

  const docs = fs.getDocumentsPath();
  if (docs) {
    candidates.push({
      path: joinPaths(docs, exeStem, 'savedata'),
      confidence: 'medium',
      source: 'user-profile',
      matchedStrategy: 'kirikiri',
    });
  }

  return rankSaveCandidates(candidates, fs, KIRIKIRI_PATTERNS);
}

// --- User Profile / Saved Games / Documents standard locations ---
export async function resolveUserProfileSave(
  exeDir: string,
  exeStem: string,
  fs: FileSystemProvider
): Promise<ResolvedSaveLocation | null> {
  const candidates: SaveCandidate[] = [];

  const savedGames = fs.getSavedGamesPath();
  if (savedGames) {
    candidates.push({
      path: joinPaths(savedGames, exeStem),
      confidence: 'high',
      source: 'user-profile',
      matchedStrategy: 'user-profile-saved-games',
    });
  }

  const docs = fs.getDocumentsPath();
  if (docs) {
    candidates.push(
      {
        path: joinPaths(docs, 'My Games', exeStem),
        confidence: 'high',
        source: 'user-profile',
        matchedStrategy: 'user-profile-documents',
      },
      {
        path: joinPaths(docs, exeStem, 'Saved'),
        confidence: 'medium',
        source: 'user-profile',
        matchedStrategy: 'user-profile-documents',
      },
      {
        path: joinPaths(docs, exeStem, 'Save'),
        confidence: 'medium',
        source: 'user-profile',
        matchedStrategy: 'user-profile-documents',
      }
    );
  }

  return rankSaveCandidates(candidates, fs);
}
