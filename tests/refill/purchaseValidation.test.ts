import { describe, expect, it } from 'vitest';
import { PurchaseInput } from '../../src/domain/types';
import { CurrencyMismatchError, ValidationError } from '../../src/errors';
import { validatePurchaseInput } from '../../src/refill/purchaseValidation';

const valid = (overrides: Partial<PurchaseInput> = {}): PurchaseInput => ({
  amountMinor: 50_000,
  currency: 'NOK',
  items: [{ name: 'Chips', quantity: 5 }],
  receiptRef: 'receipt_1',
  ...overrides,
});

describe('validatePurchaseInput', () => {
  it('accepts a valid purchase, with or without line totals', () => {
    expect(() => validatePurchaseInput(valid(), 'NOK')).not.toThrow();
    expect(() =>
      validatePurchaseInput(
        valid({
          items: [
            { name: 'Chips', quantity: 5, lineTotalMinor: 30_000 },
            { name: 'Soda', quantity: 2, lineTotalMinor: 20_000 },
          ],
        }),
        'NOK',
      ),
    ).not.toThrow();
  });

  it('accepts line totals on only some items without checking the sum', () => {
    const items = [
      { name: 'Chips', quantity: 5, lineTotalMinor: 10_000 },
      { name: 'Soda', quantity: 2 },
    ];
    expect(() => validatePurchaseInput(valid({ items }), 'NOK')).not.toThrow();
  });

  it.each([
    ['zero amount', valid({ amountMinor: 0 })],
    ['negative amount', valid({ amountMinor: -100 })],
    ['fractional amount', valid({ amountMinor: 100.5 })],
    ['empty items', valid({ items: [] })],
    ['zero quantity', valid({ items: [{ name: 'Chips', quantity: 0 }] })],
    ['fractional quantity', valid({ items: [{ name: 'Chips', quantity: 1.5 }] })],
    ['blank item name', valid({ items: [{ name: '  ', quantity: 1 }] })],
    ['fractional line total', valid({ items: [{ name: 'Chips', quantity: 1, lineTotalMinor: 9.5 }] })],
    [
      'line totals not adding up to the amount',
      valid({
        items: [
          { name: 'Chips', quantity: 5, lineTotalMinor: 30_000 },
          { name: 'Soda', quantity: 2, lineTotalMinor: 10_000 },
        ],
      }),
    ],
    ['blank receipt reference', valid({ receiptRef: ' ' })],
  ])('rejects %s with ValidationError', (_case, input) => {
    expect(() => validatePurchaseInput(input, 'NOK')).toThrow(ValidationError);
  });

  it("rejects a currency other than the office's with CurrencyMismatchError", () => {
    expect(() => validatePurchaseInput(valid({ currency: 'INR' }), 'NOK')).toThrow(CurrencyMismatchError);
    expect(() => validatePurchaseInput(valid({ currency: 'NOK' }), 'INR')).toThrow(CurrencyMismatchError);
  });
});
