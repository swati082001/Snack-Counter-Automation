import { describe, expect, it } from 'vitest';
import { SystemClock } from '../src/clock';

describe('SystemClock', () => {
  it('returns the current real time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});
