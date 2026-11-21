import { describe, it, expect } from 'vitest';

describe('Happy-DOM Environment Baseline', () => {
  it('initializes window and document globals correctly', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
    expect(typeof document.createElement).toBe('function');
  });
});
