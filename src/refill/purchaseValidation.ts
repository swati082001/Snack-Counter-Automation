import { Currency, PurchaseInput } from '../domain/types';
import { CurrencyMismatchError, ValidationError } from '../errors';

const isPositiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;

// Checks what the buyer typed in with the receipt. Throws on the first problem.
export function validatePurchaseInput(input: PurchaseInput, officeCurrency: Currency): void {
  if (!isPositiveInteger(input.amountMinor)) {
    throw new ValidationError(`Amount must be a positive whole number of minor units, got ${input.amountMinor}`);
  }

  // Snacks are bought locally, so they are paid in the office's currency,
  // even by a visitor whose salary is in another currency.
  if (input.currency !== officeCurrency) {
    throw new CurrencyMismatchError(`This office buys in ${officeCurrency}, not ${input.currency}`);
  }

  if (input.items.length === 0) {
    throw new ValidationError('A purchase needs at least one snack item');
  }
  for (const item of input.items) {
    if (item.name.trim() === '') {
      throw new ValidationError('Every snack item needs a name');
    }
    if (!isPositiveInteger(item.quantity)) {
      throw new ValidationError(`Quantity of "${item.name}" must be a positive whole number, got ${item.quantity}`);
    }
    if (item.lineTotalMinor !== undefined && !(Number.isSafeInteger(item.lineTotalMinor) && item.lineTotalMinor >= 0)) {
      throw new ValidationError(`Line total of "${item.name}" must be a whole number of minor units`);
    }
  }

  // Line totals are optional. When every item has one, they must add up to
  // the receipt total, so the per-snack report stays consistent.
  const lineTotals = input.items.map((item) => item.lineTotalMinor);
  if (lineTotals.every((total) => total !== undefined)) {
    const sum = lineTotals.reduce<number>((total, line) => total + (line ?? 0), 0);
    if (sum !== input.amountMinor) {
      throw new ValidationError(`Line totals add up to ${sum}, but the amount is ${input.amountMinor}`);
    }
  }

  if (input.receiptRef.trim() === '') {
    throw new ValidationError('A receipt reference is required');
  }
}
