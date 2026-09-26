/**
 * Pure, cross-process headless path subsumption and normalization module.
 * Consumed by both Electron Main and Renderer processes with zero `node:path` built-in imports or ambient Node globals.
 */

declare const process: { platform?: string } | undefined;
declare const navigator: { userAgent?: string } | undefined;

export type PlatformInput = 'win32' | 'linux' | 'darwin' | 'windows' | 'macos';

/**
 * Normalizes Engine and Node platform strings to canonical Node platform representations.
 */
export function normalizePlatformInput(platform: PlatformInput): 'win32' | 'linux' | 'darwin' {
  if (platform === 'windows') return 'win32';
  if (platform === 'macos') return 'darwin';
  return platform;
}

/**
 * Resolves the active platform across explicit argument, Node process.platform, and browser navigator.userAgent.
 */
export function resolvePlatform(targetPlatform?: PlatformInput): 'win32' | 'linux' | 'darwin' {
  if (targetPlatform) return normalizePlatformInput(targetPlatform);
  if (typeof process !== 'undefined' && process?.platform) {
    return normalizePlatformInput(process.platform as PlatformInput);
  }
  if (typeof navigator !== 'undefined') {
    if (navigator.userAgent?.includes('Mac')) return 'darwin';
    if (navigator.userAgent?.includes('Linux')) return 'linux';
  }
  return 'win32';
}

/**
 * Normalizes a path string for platform-aware comparison and subsumption.
 * - Rejects non-string, whitespace-only, illegal control characters, and null bytes (/\0|\r|\n/) -> returns ""
 * - Converts all backslashes to forward slashes
 * - Maps bare Windows drive roots matching ^[A-Za-z]:$ to append trailing root slash (e.g. C: -> C:/)
 * - Resolves relative segments (. and ..) using a segment stack, disallowing .. from escaping root boundary
 * - Strips trailing slashes from all non-root paths (preserving root drive C:/ or POSIX /)
 * - Applies lowercase normalization on Windows and macOS; preserves case on Linux
 */
export function normalizePathForPlatform(p: string, targetPlatform?: PlatformInput): string {
  if (typeof p !== 'string' || !p.trim() || /\0|\r|\n/.test(p)) {
    return '';
  }

  const resolved = resolvePlatform(targetPlatform);
  let cleaned = p.trim().replace(/\\/g, '/');

  if (/^[A-Za-z]:$/.test(cleaned)) {
    cleaned += '/';
  }

  let root = '';
  let remainder = cleaned;

  const driveMatch = cleaned.match(/^[A-Za-z]:\//);
  if (driveMatch) {
    root = driveMatch[0];
    remainder = cleaned.slice(root.length);
  } else if (cleaned.startsWith('/')) {
    root = '/';
    remainder = cleaned.replace(/^\/+/, '');
  }

  const rawSegments = remainder.split('/');
  const stack: string[] = [];

  for (const seg of rawSegments) {
    if (!seg || seg === '.') {
      continue;
    }
    if (seg === '..') {
      if (stack.length > 0) {
        stack.pop();
      }
      continue;
    }
    stack.push(seg);
  }

  let result: string;
  if (root) {
    if (stack.length === 0) {
      result = root;
    } else {
      result = root + stack.join('/');
    }
  } else {
    result = stack.join('/');
  }

  if (resolved === 'win32' || resolved === 'darwin') {
    return result.toLowerCase();
  }
  return result;
}

/**
 * Evaluates whether childPath is contained within or identical to parentPath at path segment boundaries.
 * Returns strictly false if either input normalizes to empty string.
 */
export function isSubsumedBy(
  childPath: string,
  parentPath: string,
  targetPlatform?: PlatformInput
): boolean {
  const normalizedChild = normalizePathForPlatform(childPath, targetPlatform);
  const normalizedParent = normalizePathForPlatform(parentPath, targetPlatform);

  if (!normalizedChild || !normalizedParent) {
    return false;
  }

  const prefix = normalizedParent.endsWith('/') ? normalizedParent : normalizedParent + '/';
  return normalizedChild === normalizedParent || normalizedChild.startsWith(prefix);
}

/**
 * Discovers topmost ancestor directories while preserving relative order of top ancestors using
 * order-independent topological ancestor filtering.
 * Sanitizes input paths by filtering out empty/whitespace elements, deduplicating by canonical normalized form,
 * and filtering out any path subsumed by a distinct ancestor.
 */
export function subsumeLibraryPaths(
  paths: string[],
  targetPlatform?: PlatformInput
): string[] {
  if (!Array.isArray(paths)) {
    return [];
  }

  const deduped: string[] = [];
  const seenNormalized = new Set<string>();

  for (const p of paths) {
    if (typeof p !== 'string' || !p.trim()) {
      continue;
    }
    const norm = normalizePathForPlatform(p, targetPlatform);
    if (!norm) {
      continue;
    }
    if (!seenNormalized.has(norm)) {
      seenNormalized.add(norm);
      deduped.push(p);
    }
  }

  return deduped.filter(p => {
    const normP = normalizePathForPlatform(p, targetPlatform);
    return !deduped.some(other => {
      const normOther = normalizePathForPlatform(other, targetPlatform);
      return normP !== normOther && isSubsumedBy(p, other, targetPlatform);
    });
  });
}

/**
 * Pure string leaf folder name extraction without Node path built-ins.
 * Strips trailing slashes, handles root boundaries (returning C: for C:/ and / for /),
 * and returns "" for empty, non-string, or whitespace-only inputs.
 */
export function getFolderBaseName(folderPath: string): string {
  if (typeof folderPath !== 'string' || !folderPath.trim()) {
    return '';
  }

  const trimmed = folderPath.trim().replace(/\\/g, '/');

  const driveMatch = trimmed.match(/^([A-Za-z]:)\/*$/);
  if (driveMatch) {
    return driveMatch[1];
  }

  if (/^\/+$/.test(trimmed)) {
    return '/';
  }

  const withoutTrailing = trimmed.replace(/\/+$/, '');
  const lastSlash = withoutTrailing.lastIndexOf('/');
  return lastSlash !== -1 ? withoutTrailing.slice(lastSlash + 1) : withoutTrailing;
}

/**
 * Helper to tokenize path segments preserving authentic segment casing while resolving . and ..
 */
function tokenizePathSegments(p: string, platform: 'win32' | 'linux' | 'darwin'): string[] {
  let cleaned = p.trim().replace(/\\/g, '/');

  if (platform === 'win32' && /^[A-Za-z]:$/.test(cleaned)) {
    cleaned += '/';
  }

  if (platform === 'win32' && /^[A-Za-z]:\//.test(cleaned)) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('/')) {
    cleaned = cleaned.replace(/^\/+/, '');
  }

  const rawSegments = cleaned.split('/');
  const stack: string[] = [];

  for (const seg of rawSegments) {
    if (!seg || seg === '.') {
      continue;
    }
    if (seg === '..') {
      if (stack.length > 0) {
        stack.pop();
      }
      continue;
    }
    stack.push(seg);
  }

  return stack;
}

/**
 * Pure-string cross-process key derivation helper with zero Node path dependencies.
 * When folderPath is contained within libraryPath and distinct, extracts the relative subpath
 * using tokenized path segments preserving authentic directory casing.
 * Fallback invariant: when identical, disjoint, or relative subpath is empty, returns getFolderBaseName(folderPath).
 */
export function buildGameKey(
  libraryPath: string,
  folderPath: string,
  targetPlatform?: PlatformInput
): string {
  const platform = resolvePlatform(targetPlatform);

  if (
    !isSubsumedBy(folderPath, libraryPath, targetPlatform) ||
    normalizePathForPlatform(folderPath, targetPlatform) === normalizePathForPlatform(libraryPath, targetPlatform)
  ) {
    return getFolderBaseName(folderPath);
  }

  const libSegments = tokenizePathSegments(libraryPath, platform);
  const folderSegments = tokenizePathSegments(folderPath, platform);

  const relativeSegments = folderSegments.slice(libSegments.length);

  if (relativeSegments.length === 0) {
    return getFolderBaseName(folderPath);
  }

  return relativeSegments.join('/');
}

/**
 * Clusters subsumed child paths immediately beneath their respective parent roots.
 * Strictly matches each root in reorderedRootPaths against allConfiguredPaths to emit authentic configured strings.
 * Skips alien/unmatched roots and already-seen paths.
 * Sweeps allConfiguredPaths and appends any unmentioned/offline paths to guarantee a bijective permutation.
 */
export function reorderLibraryPathsWithSubsumption(
  allConfiguredPaths: string[],
  reorderedRootPaths: string[],
  targetPlatform?: PlatformInput
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const root of reorderedRootPaths) {
    const normalizedRoot = normalizePathForPlatform(root, targetPlatform);
    if (!normalizedRoot || seen.has(normalizedRoot)) {
      continue;
    }

    const matchedConfiguredPath = allConfiguredPaths.find(
      p => normalizePathForPlatform(p, targetPlatform) === normalizedRoot
    );

    if (!matchedConfiguredPath) {
      continue;
    }

    result.push(matchedConfiguredPath);
    seen.add(normalizedRoot);

    for (const candidate of allConfiguredPaths) {
      const normalizedCandidate = normalizePathForPlatform(candidate, targetPlatform);
      if (!normalizedCandidate || seen.has(normalizedCandidate)) {
        continue;
      }
      if (isSubsumedBy(candidate, matchedConfiguredPath, targetPlatform)) {
        result.push(candidate);
        seen.add(normalizedCandidate);
      }
    }
  }

  for (const p of allConfiguredPaths) {
    const normalized = normalizePathForPlatform(p, targetPlatform);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    result.push(p);
    seen.add(normalized);
  }

  return result;
}
