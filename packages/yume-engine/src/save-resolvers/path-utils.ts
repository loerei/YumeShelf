/**
 * Path manipulation utilities for headless save resolution
 * Pure string operations without Node 'path' module dependencies for 100% cross-platform purity
 */

export function normalizePath(p: string): string {
  if (!p) return '';
  let norm = p.replace(/\\/g, '/').replace(/\/+/g, '/');
  // Normalize Windows drive letter casing: c:/ -> C:/
  if (/^[a-zA-Z]:\//.test(norm)) {
    norm = norm[0].toUpperCase() + norm.slice(1);
  }
  // Remove trailing slash unless it's root like 'C:/' or '/'
  if (norm.length > 1 && norm.endsWith('/') && !/^[a-zA-Z]:\/$/.test(norm)) {
    norm = norm.slice(0, -1);
  }
  return norm;
}

export function joinPaths(...paths: (string | undefined | null)[]): string {
  const valid = paths.filter((p): p is string => Boolean(p && typeof p === 'string' && p.trim() !== ''));
  if (valid.length === 0) return '';
  
  let result = '';
  for (let i = 0; i < valid.length; i++) {
    const segment = valid[i].replace(/\\/g, '/');
    if (i === 0) {
      result = segment;
    } else {
      if (result.endsWith('/') || segment.startsWith('/')) {
        result = `${result.replace(/\/+$/, '')}/${segment.replace(/^\/+/, '')}`;
      } else {
        result = `${result}/${segment}`;
      }
    }
  }

  return normalizePath(result);
}

export function dirName(p: string): string {
  const norm = normalizePath(p);
  const idx = norm.lastIndexOf('/');
  if (idx <= 0) {
    if (/^[a-zA-Z]:$/.test(norm) || norm === '/') return norm;
    return norm.startsWith('/') ? '/' : '.';
  }
  // Special case for Windows drive root like C:/foo -> C:/
  if (idx === 2 && /^[a-zA-Z]:/.test(norm)) {
    return norm.substring(0, 3);
  }
  return norm.substring(0, idx);
}

export function baseName(p: string, ext?: string): string {
  const norm = normalizePath(p);
  const idx = norm.lastIndexOf('/');
  let base = idx >= 0 ? norm.substring(idx + 1) : norm;
  if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) {
    base = base.substring(0, base.length - ext.length);
  }
  return base;
}

export function getExeStem(exePath: string, bundleRoot?: string | null): string {
  if (!exePath && !bundleRoot) return '';

  const cleanBundle = bundleRoot ? String(bundleRoot).replace(/\0|%00/g, '').trim() : null;
  const cleanExe = exePath ? String(exePath).replace(/\0|%00/g, '').trim() : '';

  let stem = '';
  if (cleanBundle && cleanBundle.length > 0) {
    stem = baseName(cleanBundle, '.app');
  } else if (baseName(cleanExe).toLowerCase().endsWith('.app')) {
    stem = baseName(cleanExe, '.app');
  } else {
    const base = baseName(cleanExe);
    stem = base.replace(/\.(exe|x86_64|x86|appimage|sh|bin)$/i, '');
    stem = stem.replace(/-(linux|win64|win32)-shipping$/i, '');
  }

  stem = stem.replace(/\bv?\d+(?:\.\d+)*\b/gi, ' ').replace(/\bpc\b/gi, ' ').trim();

  // Sanitize stem: strip path separators, null bytes, and traversal tokens
  stem = stem.replace(/\0|%00/g, '');
  stem = stem.replace(/[/\\]/g, '');
  while (stem.includes('..')) {
    stem = stem.replace(/\.\./g, '');
  }
  return stem.trim();
}

export function normalizeForSearch(text: unknown): string {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[v.\s_-]+/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Sanitize path component (company, product, stem, bundle identifier, etc.)
 * Strips path separators, null bytes, and traversal tokens (..).
 * Trims whitespace.
 */
export function sanitizePathComponent(component: string | null | undefined): string {
  if (!component) return '';
  let sanitized = String(component).replace(/\0|%00/g, '').trim();
  sanitized = sanitized.replace(/[/\\]/g, '');
  while (sanitized.includes('..')) {
    sanitized = sanitized.replace(/\.\./g, '');
  }
  return sanitized.trim();
}

/**
 * Validates that a resolved path is strictly contained within baseDir
 * and does not equal baseDir or any excluded root dirs (e.g. appSupportHome, preferencesHome).
 */
export function isStrictlyContained(
  resolvedPath: string,
  baseDir: string,
  excludedDirs: (string | undefined | null)[] = []
): boolean {
  if (!resolvedPath || !baseDir) return false;
  const normResolved = normalizePath(resolvedPath);
  const normBase = normalizePath(baseDir);
  if (!normResolved || !normBase) return false;

  // Reject directory traversal
  if (normResolved.includes('..')) return false;

  // Root collapse check: cannot equal baseDir
  if (normResolved.toLowerCase() === normBase.toLowerCase()) return false;

  // Cannot equal any excluded directory
  for (const excluded of excludedDirs) {
    if (excluded) {
      const normExcluded = normalizePath(excluded);
      if (normExcluded && normResolved.toLowerCase() === normExcluded.toLowerCase()) {
        return false;
      }
    }
  }

  // Must reside strictly inside baseDir
  const basePrefix = normBase.endsWith('/') ? normBase.toLowerCase() : `${normBase.toLowerCase()}/`;
  return normResolved.toLowerCase().startsWith(basePrefix);
}
