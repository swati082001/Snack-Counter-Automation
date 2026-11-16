import { Purchase, Refill, Volunteer } from '../../src/domain/types';

// An opted-in Oslo volunteer who is in the office today.
export function buildVolunteer(overrides: Partial<Volunteer> = {}): Volunteer {
  return {
    employeeId: 'emp_oslo_1',
    name: 'Oslo Volunteer',
    homeOffice: 'OSLO',
    payrollCurrency: 'NOK',
    currentOffice: 'OSLO',
    availability: 'OFFICE',
    optedIn: true,
    ...overrides,
  };
}

// An open Oslo refill with nobody asked yet.
export function buildRefill(overrides: Partial<Refill> = {}): Refill {
  return {
    id: 'refill_1',
    office: 'OSLO',
    state: 'OPEN',
    version: 1,
    reportedBy: 'emp_oslo_1',
    createdAt: new Date('2026-11-16T08:00:00.000Z'),
    currentOffer: null,
    excludedVolunteerIds: [],
    claimedBy: null,
    claimDeadline: null,
    purchaseId: null,
    history: [],
    ...overrides,
  };
}

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
    hrSubmitAttempts: 0,
    hrReminderSentAt: null,
    ...overrides,
  };
}
