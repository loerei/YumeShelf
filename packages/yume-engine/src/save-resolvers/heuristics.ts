import type { FileSystemProvider, ResolvedSaveLocation } from '../types.js';
import { dirName, joinPaths, normalizeForSearch } from './path-utils.js';

export const SAVE_DIR_NAMES = /^(save|saves|savedata|save_data|savefiles|saved_games|savegames)$/i;
export const GENERIC_SAVE_EXTENSIONS = /\.(sav|save|rpgsave|rmmvsave|rmmzsave|rvdata2|rvdata|rxdata|lsd|dat|sol|ksd|asd|bin|bytes|json|ini)$/i;
const MAX_HEURISTIC_DEPTH = 3;

const GENERIC_STEMS = new Set([
  'game', 'app', 'play', 'start', 'main', 'launcher', 'client',
  'build', 'windows', 'defaultcompany', 'shipping', 'release',
  'win64', 'win32', 'x64', 'x86', 'setup', 'config'
]);

export interface SaveCandidate {
  path: string;
  confidence: 'high' | 'medium' | 'low' | 'none';
  source: 'override' | 'deterministic' | 'heuristic' | 'appdata' | 'user-profile' | 'wine' | 'none';
  matchedStrategy?: string;
  files?: string[];
  score?: number;
}

export async function isDirectory(path: string, fs: FileSystemProvider): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function scanDirectoryForSaveFiles(
  dirPath: string,
  fs: FileSystemProvider,
  pattern: RegExp = GENERIC_SAVE_EXTENSIONS
): Promise<string[]> {
  try {
    if (!(await isDirectory(dirPath, fs))) return [];
    const entries = await fs.readdir(dirPath);
    return entries.filter((e) => pattern.test(e));
  } catch {
    return [];
  }
}

export async function deepenSaveFolder(
  foundPath: string | null | undefined,
  fs: FileSystemProvider
): Promise<string | null | undefined> {
  if (!foundPath) return foundPath;
  try {
    if (!(await isDirectory(foundPath, fs))) return foundPath;

    const naniPath = joinPaths(foundPath, 'NaninovelData', 'NaniSaves');
    if (await fs.exists(naniPath)) return naniPath;

    const subDirs = ['Save', 'Saves', 'SaveGames', 'SaveData', 'savedata', 'saves', 'game_save'];
    for (const sub of subDirs) {
      const candidate = joinPaths(foundPath, sub);
      if (await isDirectory(candidate, fs)) {
        return candidate;
      }
    }
  } catch {
    // ignore
  }
  return foundPath;
}

export async function rankSaveCandidates(
  candidates: SaveCandidate[],
  fs: FileSystemProvider,
  saveFilePattern: RegExp = GENERIC_SAVE_EXTENSIONS
): Promise<ResolvedSaveLocation | null> {
  if (!candidates || candidates.length === 0) return null;

  const evaluated: SaveCandidate[] = [];

  for (const cand of candidates) {
    if (!cand.path) continue;
    try {
      const exists = await fs.exists(cand.path);
      if (!exists) continue;

      const isDir = await isDirectory(cand.path, fs);
      if (!isDir) continue;

      const files = await scanDirectoryForSaveFiles(cand.path, fs, saveFilePattern);
      
      let baseScore = 0;
      switch (cand.source) {
        case 'override':
          baseScore = 1000;
          break;
        case 'deterministic':
          baseScore = 500;
          break;
        case 'wine':
          baseScore = 400;
          break;
        case 'user-profile':
        case 'appdata':
          baseScore = 300;
          break;
        case 'heuristic':
          baseScore = 100;
          break;
        default:
          baseScore = 50;
      }

      // Slot files bonus: Having active save files significantly increases priority and confidence
      const fileBonus = files.length * 20;
      const score = baseScore + fileBonus;

      const confidence = cand.confidence === 'high' || files.length > 0 ? 'high' : cand.confidence;

      evaluated.push({
        ...cand,
        files,
        score,
        confidence,
      });
    } catch {
      // ignore
    }
  }

  if (evaluated.length === 0) return null;

  // Rank by score descending
  evaluated.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const best = evaluated[0];
  const deepenedPath = await deepenSaveFolder(best.path, fs);

  let finalFiles = best.files;
  if (deepenedPath && deepenedPath !== best.path) {
    finalFiles = await scanDirectoryForSaveFiles(deepenedPath, fs, saveFilePattern);
  }

  return {
    path: deepenedPath || best.path,
    confidence: best.confidence,
    source: best.source,
    matchedStrategy: best.matchedStrategy,
    files: finalFiles,
  };
}

async function checkSaveCandidateDir(
  exeDir: string,
  entryName: string,
  fs: FileSystemProvider
): Promise<ResolvedSaveLocation | null> {
  const fullPath = joinPaths(exeDir, entryName);
  if (!(await isDirectory(fullPath, fs))) return null;

  if (SAVE_DIR_NAMES.test(entryName)) {
    const files = await scanDirectoryForSaveFiles(fullPath, fs);
    if (files.length > 0) {
      return {
        path: fullPath,
        confidence: 'high',
        source: 'heuristic',
        files,
      };
    }
    // Even if empty, it matches standard save directory name
    return {
      path: fullPath,
      confidence: 'medium',
      source: 'heuristic',
      files: [],
    };
  }
  return null;
}

export async function heuristicSaveScan(
  exeDir: string,
  fs: FileSystemProvider,
  depth = 0
): Promise<ResolvedSaveLocation | null> {
  if (depth > MAX_HEURISTIC_DEPTH) return null;

  try {
    const entries = await fs.readdir(exeDir);
    for (const entryName of entries) {
      const match = await checkSaveCandidateDir(exeDir, entryName, fs);
      if (match) return match;
    }

    for (const entryName of entries) {
      const fullPath = joinPaths(exeDir, entryName);
      if (!(await isDirectory(fullPath, fs))) continue;
      if (/^(node_modules|lib|www|data|img|audio|fonts|css|js|plugins|effects|locales)$/i.test(entryName)) {
        continue;
      }

      const result = await heuristicSaveScan(fullPath, fs, depth + 1);
      if (result) return result;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function appDataFuzzyMatch(
  exeDir: string,
  exeStem: string,
  fs: FileSystemProvider
): Promise<ResolvedSaveLocation | null> {
  let effectiveStem = normalizeForSearch(exeStem);
  if (!effectiveStem || GENERIC_STEMS.has(effectiveStem) || effectiveStem.length < 3) {
    const parentFolder = dirName(exeDir);
    effectiveStem = normalizeForSearch(parentFolder);
  }
  if (!effectiveStem || GENERIC_STEMS.has(effectiveStem) || effectiveStem.length < 3) return null;

  const unityRoots = new Set<string>();
  const unrealRoots = new Set<string>();

  // 1. Windows standard paths
  const userProfile = fs.getUserProfilePath();
  if (userProfile) {
    unityRoots.add(joinPaths(userProfile, 'AppData', 'LocalLow'));
  }
  const localAppData = fs.getLocalAppDataPath();
  if (localAppData) {
    unrealRoots.add(localAppData);
  }

  // 2. Linux XDG paths
  if (fs.getXdgConfigHome) {
    unityRoots.add(joinPaths(fs.getXdgConfigHome(), 'unity3d'));
    unrealRoots.add(joinPaths(fs.getXdgConfigHome(), 'Epic'));
  }
  if (userProfile) {
    unityRoots.add(joinPaths(userProfile, '.config', 'unity3d'));
  }
  if (fs.getXdgDataHome) {
    unrealRoots.add(fs.getXdgDataHome());
  }

  // 3. Wine / Proton prefixes
  if (fs.getWinePrefixRoots && fs.getWineAppDataPaths) {
    try {
      const winePrefixes = await fs.getWinePrefixRoots(exeDir);
      for (const prefix of winePrefixes) {
        const localLowPaths = await fs.getWineAppDataPaths(prefix, 'LocalLow');
        for (const localLow of localLowPaths) {
          unityRoots.add(localLow);
        }
        const localPaths = await fs.getWineAppDataPaths(prefix, 'Local');
        for (const local of localPaths) {
          unrealRoots.add(local);
        }
      }
    } catch {
      // ignore prefix discovery errors
    }
  }

  // Fuzzy match Unity LocalLow
  for (const localLow of unityRoots) {
    try {
      if (!(await fs.exists(localLow))) continue;
      const companies = await fs.readdir(localLow);
      for (const company of companies) {
        const companyPath = joinPaths(localLow, company);
        try {
          if (!(await isDirectory(companyPath, fs))) continue;
          const products = await fs.readdir(companyPath);
          const match = products.find((product) => {
            const normProduct = normalizeForSearch(product);
            if (!normProduct || GENERIC_STEMS.has(normProduct) || normProduct.length < 3) return false;
            if (normProduct === effectiveStem) return true;
            if (effectiveStem.length >= 5 && normProduct.length >= 5) {
              return normProduct.includes(effectiveStem) || effectiveStem.includes(normProduct);
            }
            return false;
          });
          if (match) {
            const matchedPath = joinPaths(companyPath, match);
            const files = await scanDirectoryForSaveFiles(matchedPath, fs);
            return {
              path: matchedPath,
              confidence: files.length > 0 ? 'medium' : 'low',
              source: 'appdata',
              matchedStrategy: 'unity',
              files,
            };
          }
        } catch {
          continue;
        }
      }
    } catch {
      // ignore
    }
  }

  // Fuzzy match Unreal LocalAppData
  for (const localRoot of unrealRoots) {
    try {
      if (!(await fs.exists(localRoot))) continue;
      const entries = await fs.readdir(localRoot);
      const match = entries.find((entry) => {
        const normEntry = normalizeForSearch(entry);
        if (!normEntry || GENERIC_STEMS.has(normEntry) || normEntry.length < 3) return false;
        if (normEntry === effectiveStem) return true;
        if (effectiveStem.length >= 5 && normEntry.length >= 5) {
          return normEntry.includes(effectiveStem) || effectiveStem.includes(normEntry);
        }
        return false;
      });
      if (match) {
        const saveGames = joinPaths(localRoot, match, 'Saved', 'SaveGames');
        if (await fs.exists(saveGames)) {
          const files = await scanDirectoryForSaveFiles(saveGames, fs);
          return {
            path: saveGames,
            confidence: files.length > 0 ? 'medium' : 'low',
            source: 'appdata',
            matchedStrategy: 'unreal-sav',
            files,
          };
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}
