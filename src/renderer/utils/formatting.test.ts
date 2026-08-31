// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { formatBytes, formatPlaytime } from './formatting';

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
