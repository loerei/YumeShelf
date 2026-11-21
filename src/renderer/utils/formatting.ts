export type LocalizationDictionary = Record<string, unknown>;
export type LocalizationProvider = (() => LocalizationDictionary) | LocalizationDictionary;

export function timeSince(
  date: Date | string | number | null | undefined,
  getStrings: LocalizationProvider,
  now: Date | number = new Date()
): string {
  const raw = typeof getStrings === 'function' ? getStrings() : (getStrings || {});
  const d = raw as Record<string, string | undefined>;
  if (!date || date === 0) return d.status_never || '';

  const past = new Date(date);
  if (isNaN(past.getTime())) return '';

  const current = typeof now === 'number' ? new Date(now) : (now instanceof Date ? now : new Date(now));
  if (isNaN(current.getTime())) return '';

  const diffMs = current.getTime() - past.getTime();
  if (diffMs < 0) return d.status_recent || '';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return d.status_recent || '';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${d.status_mins || ''}`;

  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours}${d.status_hours || ''}`;

  const days = Math.floor(seconds / 86400);
  if (days < 30) return `${days}${d.status_days || ''}`;

  const months = Math.floor(seconds / (86400 * 30));
  if (months < 12) return `${months}${d.status_months || ''}`;

  const years = Math.floor(seconds / (86400 * 365));
  return `${years}${d.status_years || ''}`;
}

export function formatPlaytime(ms: number | null | undefined): string {
  if (!ms || ms < 60000) return '0m';
  const totalMins = Math.floor(ms / 60000);
  let hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    hours = hours % 24;
    return `${days}d ${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === undefined || bytes === null || typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) {
    return '';
  }
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.min(i, sizes.length - 1);
  const value = bytes / Math.pow(k, index);
  return `${index === 0 ? value : value.toFixed(2)} ${sizes[index]}`;
}
