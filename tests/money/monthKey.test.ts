import { describe, expect, it } from 'vitest';
import { monthKey } from '../../src/money/monthKey';

const OSLO = 'Europe/Oslo';
const BENGALURU = 'Asia/Kolkata';

describe('monthKey', () => {
  it('puts 23:30 on 30 November in Oslo into November, though it is already December in Bengaluru', () => {
    // Oslo is UTC+1 in November, so 23:30 local is 22:30 UTC = 04:00 on 1 December in Bengaluru.
    const lateNovemberInOslo = new Date('2026-11-30T22:30:00.000Z');

    expect(monthKey(lateNovemberInOslo, OSLO)).toBe('2026-11');
    expect(monthKey(lateNovemberInOslo, BENGALURU)).toBe('2026-12');
  });

  it('gives each office its own month for a UTC timestamp crossing the month boundary', () => {
    // 20:00 UTC on 30 November = 21:00 in Oslo (November), 01:30 on 1 December in Bengaluru.
    const instant = new Date('2026-11-30T20:00:00.000Z');

    expect(monthKey(instant, OSLO)).toBe('2026-11');
    expect(monthKey(instant, BENGALURU)).toBe('2026-12');
  });

  it('moves to the next month in Oslo before UTC does, using summer time', () => {
    // Oslo is UTC+2 in August, so 22:30 UTC on 31 August is 00:30 on 1 September.
    expect(monthKey(new Date('2026-08-31T22:30:00.000Z'), OSLO)).toBe('2026-09');
  });

  it('handles the year boundary', () => {
    const newYearInOslo = new Date('2026-12-31T23:30:00.000Z');

    expect(monthKey(newYearInOslo, OSLO)).toBe('2027-01');
    expect(monthKey(newYearInOslo, BENGALURU)).toBe('2027-01');
    expect(monthKey(newYearInOslo, 'UTC')).toBe('2026-12');
  });
});
