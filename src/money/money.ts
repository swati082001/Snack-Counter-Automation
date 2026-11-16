import { Currency, Money } from '../domain/types';
import { CurrencyMismatchError, ValidationError } from '../errors';

// Money is always a whole number of minor units (øre, paise). Floats would
// drift when amounts are added up, so non-integers are rejected at creation.
export function createMoney(amountMinor: number, currency: Currency): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new ValidationError(`Amount must be a whole number of minor units, got ${amountMinor}`);
  }
  return { amountMinor, currency };
}

export function zeroMoney(currency: Currency): Money {
  return createMoney(0, currency);
}

// NOK and INR are never added directly: a total across currencies only exists
// after an explicit conversion.
function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(`Cannot combine ${a.currency} with ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return createMoney(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return createMoney(a.amountMinor - b.amountMinor, a.currency);
}

export function sumMoney(amounts: readonly Money[], currency: Currency): Money {
  return amounts.reduce((total, amount) => addMoney(total, amount), zeroMoney(currency));
}

// Returns a negative number if a < b, 0 if equal, positive if a > b.
export function compareMoney(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amountMinor - b.amountMinor;
}

// Rounds once to whole minor units. Callers convert totals, not single
// purchases, so rounding happens once and does not add up.
export function convertMoney(amount: Money, to: Currency, rate: number): Money {
  if (amount.currency === to) {
    return createMoney(amount.amountMinor, to);
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new ValidationError(`Exchange rate must be a positive number, got ${rate}`);
  }
  return createMoney(Math.round(amount.amountMinor * rate), to);
}

const THOUSANDS = new Intl.NumberFormat('en-US');

// '1,234.50 NOK'. Uses integer maths so no float rounding shows in the text.
export function formatMoney(amount: Money): string {
  const sign = amount.amountMinor < 0 ? '-' : '';
  const absolute = Math.abs(amount.amountMinor);
  const major = THOUSANDS.format(Math.floor(absolute / 100));
  const minor = String(absolute % 100).padStart(2, '0');
  return `${sign}${major}.${minor} ${amount.currency}`;
}
