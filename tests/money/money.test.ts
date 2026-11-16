import { describe, expect, it } from 'vitest';
import {
  addMoney,
  compareMoney,
  convertMoney,
  createMoney,
  formatMoney,
  subtractMoney,
  sumMoney,
} from '../../src/money/money';
import { CurrencyMismatchError, ValidationError } from '../../src/errors';

const nok = (amountMinor: number) => createMoney(amountMinor, 'NOK');
const inr = (amountMinor: number) => createMoney(amountMinor, 'INR');

describe('createMoney', () => {
  it('accepts whole minor units, including zero and negatives', () => {
    expect(nok(12_345)).toEqual({ amountMinor: 12_345, currency: 'NOK' });
    expect(nok(0).amountMinor).toBe(0);
    expect(nok(-500).amountMinor).toBe(-500);
  });

  it.each([1.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects non-integer minor units (%s)',
    (amount) => {
      expect(() => nok(amount)).toThrow(ValidationError);
    },
  );
});

describe('adding and comparing', () => {
  it('adds and subtracts amounts in the same currency', () => {
    expect(addMoney(nok(30_000), nok(12_550))).toEqual(nok(42_550));
    expect(subtractMoney(nok(30_000), nok(45_000))).toEqual(nok(-15_000));
  });

  it('throws CurrencyMismatchError when mixing NOK and INR', () => {
    expect(() => addMoney(nok(100), inr(100))).toThrow(CurrencyMismatchError);
    expect(() => subtractMoney(nok(100), inr(100))).toThrow(CurrencyMismatchError);
    expect(() => compareMoney(nok(100), inr(100))).toThrow(CurrencyMismatchError);
  });

  it('sums a list, and an empty list is zero', () => {
    expect(sumMoney([inr(100), inr(250), inr(50)], 'INR')).toEqual(inr(400));
    expect(sumMoney([], 'NOK')).toEqual(nok(0));
    expect(() => sumMoney([nok(100)], 'INR')).toThrow(CurrencyMismatchError);
  });

  it('compares amounts', () => {
    expect(compareMoney(nok(100), nok(200))).toBeLessThan(0);
    expect(compareMoney(nok(200), nok(200))).toBe(0);
    expect(compareMoney(nok(300), nok(200))).toBeGreaterThan(0);
  });
});

describe('convertMoney', () => {
  it('rounds to the nearest whole minor unit', () => {
    // 123.45 INR * 0.13 = 16.0485 NOK -> 1604.85 øre -> 1605 øre
    expect(convertMoney(inr(12_345), 'NOK', 0.13)).toEqual(nok(1_605));
    // 123.40 INR * 0.13 = 1604.2 øre -> 1604 øre
    expect(convertMoney(inr(12_340), 'NOK', 0.13)).toEqual(nok(1_604));
  });

  it('returns the same amount when the currency already matches', () => {
    expect(convertMoney(nok(5_000), 'NOK', 0.13)).toEqual(nok(5_000));
  });

  it.each([0, -0.13, Number.NaN])('rejects an invalid rate (%s)', (rate) => {
    expect(() => convertMoney(inr(100), 'NOK', rate)).toThrow(ValidationError);
  });
});

describe('formatMoney', () => {
  it.each([
    [nok(123_450), '1,234.50 NOK'],
    [nok(5), '0.05 NOK'],
    [nok(-1_250), '-12.50 NOK'],
    [inr(150_000_000), '1,500,000.00 INR'],
  ])('formats %o as %s', (amount, expected) => {
    expect(formatMoney(amount)).toBe(expected);
  });
});
