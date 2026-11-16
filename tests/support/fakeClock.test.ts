import { describe, expect, it } from 'vitest';
import { FakeClock } from './fakeClock';

const START = new Date('2026-11-16T09:00:00.000Z');

describe('FakeClock', () => {
  it('stays at the start time until moved', () => {
    const clock = new FakeClock(START);

    expect(clock.now()).toEqual(START);
    expect(clock.now()).toEqual(START);
  });

  it('moves forward with advance() and jumps with set()', () => {
    const clock = new FakeClock(START);

    clock.advance(2 * 60 * 60 * 1000);
    expect(clock.now().toISOString()).toBe('2026-11-16T11:00:00.000Z');

    clock.set(new Date('2026-12-01T00:00:00.000Z'));
    expect(clock.now().toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('cannot be moved by mutating a returned date or the start date', () => {
    const start = new Date(START.getTime());
    const clock = new FakeClock(start);

    clock.now().setFullYear(2000);
    start.setFullYear(2000);

    expect(clock.now()).toEqual(START);
  });
});
