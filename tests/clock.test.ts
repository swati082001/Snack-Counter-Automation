import { describe, expect, it } from 'vitest';
import { OffsetClock, SystemClock } from '../src/clock';

describe('SystemClock', () => {
  it('returns the current real time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});

describe('OffsetClock', () => {
  it('follows real time until advanced, then runs ahead by the advanced amount', () => {
    const clock = new OffsetClock();
    const before = Date.now();
    expect(clock.now().getTime()).toBeGreaterThanOrEqual(before);

    clock.advance(2 * 60 * 60 * 1000);
    clock.advance(30 * 60 * 1000);

    const aheadBy = clock.now().getTime() - Date.now();
    expect(aheadBy).toBeGreaterThan(2.5 * 60 * 60 * 1000 - 1_000);
    expect(aheadBy).toBeLessThanOrEqual(2.5 * 60 * 60 * 1000);
  });
});
