import { describe, it, expect } from 'vitest';
import { formatBytes, formatPlaytime, timeSince } from './formatting';

const mockStrings = {
  status_never: 'Never',
  status_recent: 'Just now',
  status_mins: 'm',
  status_hours: 'h',
  status_days: 'd',
  status_months: 'mo',
  status_years: 'y',
};

describe('timeSince', () => {
  it('returns status_never for falsy or zero dates', () => {
    const now = new Date('2026-03-01T12:00:00Z');
    expect(timeSince(0, () => mockStrings, now)).toBe('Never');
    expect(timeSince(null, mockStrings, now)).toBe('Never');
    expect(timeSince(undefined, mockStrings, now)).toBe('Never');
  });

  it('returns status_recent for < 60s and future/clock-skew timestamps', () => {
    const now = new Date('2026-03-01T12:00:00Z');
    expect(timeSince(new Date('2026-03-01T11:59:30Z'), mockStrings, now)).toBe('Just now');
    expect(timeSince(new Date('2026-03-01T12:05:00Z'), mockStrings, now)).toBe('Just now');
  });

  it('computes accurate relative durations across month rollover boundaries', () => {
    expect(
      timeSince('2026-02-28T23:59:00Z', mockStrings, new Date('2026-03-01T00:01:00Z'))
    ).toBe('2m');
    expect(
      timeSince('2026-02-28T12:00:00Z', mockStrings, new Date('2026-03-01T12:00:00Z'))
    ).toBe('1d');
  });

  it('formats hours, days, months, and years', () => {
    const now = new Date('2026-06-15T12:00:00Z').getTime();
    expect(timeSince(now - 3 * 3600 * 1000, mockStrings, now)).toBe('3h');
    expect(timeSince(now - 5 * 86400 * 1000, mockStrings, now)).toBe('5d');
    expect(timeSince(now - 65 * 86400 * 1000, mockStrings, now)).toBe('2mo');
    expect(timeSince(now - 400 * 86400 * 1000, mockStrings, now)).toBe('1y');
  });
});

describe('formatBytes', () => {
  it('returns empty string for undefined, null, NaN or negative numbers', () => {
    expect(formatBytes(undefined)).toBe('');
    expect(formatBytes(null)).toBe('');
    expect(formatBytes(NaN)).toBe('');
    expect(formatBytes(-100)).toBe('');
    expect(formatBytes('invalid' as any)).toBe('');
  });

  it('formats 0 bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes, kilobytes, megabytes, and gigabytes correctly', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1536)).toBe('1.50 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
    expect(formatBytes(2.81 * 1024 * 1024 * 1024)).toBe('2.81 GB');
    expect(formatBytes(48.58 * 1024 * 1024 * 1024)).toBe('48.58 GB');
  });
});

describe('formatPlaytime', () => {
  it('formats playtimes correctly', () => {
    expect(formatPlaytime(0)).toBe('0m');
    expect(formatPlaytime(50000)).toBe('0m');
    expect(formatPlaytime(60000)).toBe('1m');
    expect(formatPlaytime(3600000)).toBe('1h 0m');
    expect(formatPlaytime(90000000)).toBe('1d 1h 0m');
  });
});
