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

export function getExeStem(exePath: string): string {
  const base = baseName(exePath || '');
  let stem = base.replace(/\.(exe|x86_64|x86|appimage|sh|bin)$/i, '');
  stem = stem.replace(/-(linux|win64|win32)-shipping$/i, '');
  stem = stem.replace(/\bv?\d+(?:\.\d+)*\b/gi, ' ').replace(/\bpc\b/gi, ' ').trim();
  return stem;
}

export function normalizeForSearch(text: unknown): string {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[v.\s_-]+/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}
