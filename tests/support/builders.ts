import { Purchase } from '../../src/domain/types';

// A valid Oslo purchase; tests override only the fields they care about.
export function buildPurchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'purchase_1',
    refillId: 'refill_1',
    buyerId: 'emp_oslo_1',
    office: 'OSLO',
    amount: { amountMinor: 50_000, currency: 'NOK' },
    items: [{ name: 'Chips', quantity: 5 }],
    receiptRef: 'receipt_1',
    purchasedAt: new Date('2026-11-10T12:00:00.000Z'),
    overBudget: false,
    unusualAmount: false,
    hrClaimId: null,
    hrStatus: 'NOT_SUBMITTED',
    hrSubmittedAt: null,
    hrReminderSentAt: null,
    ...overrides,
  };
}
