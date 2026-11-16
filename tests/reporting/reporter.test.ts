import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config';
import { Purchase, SnackItem } from '../../src/domain/types';
import { ValidationError } from '../../src/errors';
import { monthlyReport } from '../../src/reporting/reporter';
import { buildPurchase } from '../support/builders';

const config = DEFAULT_CONFIG; // INR_TO_NOK = 0.13
const MID_NOVEMBER = new Date('2026-11-15T12:00:00.000Z');

let counter = 0;
function oslo(amountMinor: number, overrides: Partial<Purchase> = {}): Purchase {
  counter += 1;
  return buildPurchase({
    id: `p${counter}`,
    office: 'OSLO',
    amount: { amountMinor, currency: 'NOK' },
    purchasedAt: MID_NOVEMBER,
    ...overrides,
  });
}

function bengaluru(amountMinor: number, overrides: Partial<Purchase> = {}): Purchase {
  return oslo(amountMinor, { office: 'BENGALURU', amount: { amountMinor, currency: 'INR' }, ...overrides });
}

const items = (...list: SnackItem[]): Partial<Purchase> => ({ items: list });

describe('monthlyReport: totals', () => {
  it('REQUIRED: combined total equals NOK total plus INR total converted once, with original amounts beside it', () => {
    const purchases = [
      oslo(40_000), // 400.00 NOK
      oslo(75_050), // 750.50 NOK
      // 3 x 500.05 INR. Converted one by one: 3 x round(6500.65) = 19,503 øre.
      // Converted once as a total: round(150,015 x 0.13) = round(19,501.95) = 19,502 øre.
      bengaluru(50_005),
      bengaluru(50_005),
      bengaluru(50_005),
    ];

    const report = monthlyReport('2026-11', purchases, config);

    expect(report.combinedTotal).toEqual({ amountMinor: 115_050 + 19_502, currency: 'NOK' });
    expect(report.reportingCurrency).toBe('NOK');
    expect(report.fxRate).toEqual({ from: 'INR', to: 'NOK', rate: 0.13 });
    expect(report.offices).toEqual([
      {
        office: 'OSLO',
        currency: 'NOK',
        budgetMinor: 600_000,
        spentMinor: 115_050,
        remainingMinor: 484_950,
        purchaseCount: 2,
        overBudget: false,
      },
      {
        office: 'BENGALURU',
        currency: 'INR',
        budgetMinor: 1_500_000,
        spentMinor: 150_015,
        remainingMinor: 1_349_985,
        purchaseCount: 3,
        overBudget: false,
      },
    ]);
  });

  it('shows an office over budget with negative remaining', () => {
    const report = monthlyReport('2026-11', [oslo(650_000)], config);

    expect(report.offices[0]).toMatchObject({ spentMinor: 650_000, remainingMinor: -50_000, overBudget: true });
  });

  it("excludes purchases from other months, using each office's own time zone", () => {
    const purchases = [
      oslo(10_000, { purchasedAt: new Date('2026-10-31T12:00:00.000Z') }), // October
      oslo(20_000, { purchasedAt: new Date('2026-11-30T22:30:00.000Z') }), // 23:30 in Oslo: November
      bengaluru(30_000, { purchasedAt: new Date('2026-11-30T19:00:00.000Z') }), // 00:30 in Bengaluru: December
      bengaluru(40_000),
    ];

    const report = monthlyReport('2026-11', purchases, config);

    expect(report.offices.map((office) => office.spentMinor)).toEqual([20_000, 40_000]);
    expect(monthlyReport('2026-12', purchases, config).offices[1].spentMinor).toBe(30_000);
  });

  it('includes rejected purchases in spend, and counts HR statuses', () => {
    const purchases = [
      oslo(10_000, { hrStatus: 'NOT_SUBMITTED' }),
      oslo(20_000, { hrStatus: 'PENDING' }),
      oslo(30_000, { hrStatus: 'APPROVED' }),
      bengaluru(40_000, { hrStatus: 'REJECTED' }),
    ];

    const report = monthlyReport('2026-11', purchases, config);

    expect(report.offices[0].spentMinor).toBe(60_000);
    expect(report.offices[1].spentMinor).toBe(40_000);
    expect(report.statusCounts).toEqual({ pendingHr: 2, reimbursed: 1, rejected: 1 });
  });

  it('returns zeros for a month without purchases', () => {
    const report = monthlyReport('2026-01', [oslo(10_000)], config);

    expect(report.combinedTotal).toEqual({ amountMinor: 0, currency: 'NOK' });
    expect(report.offices.map((office) => office.purchaseCount)).toEqual([0, 0]);
    expect(report.bySnack).toEqual([]);
    expect(report.statusCounts).toEqual({ pendingHr: 0, reimbursed: 0, rejected: 0 });
  });

  it.each(['2026-13', '2026-1', 'November', '', '2026-11-01'])('rejects month "%s" with ValidationError', (month) => {
    expect(() => monthlyReport(month, [], config)).toThrow(ValidationError);
  });
});

describe('monthlyReport: snacks', () => {
  it('aggregates snack names case-insensitively, keeping the first spelling, sorted by quantity', () => {
    const purchases = [
      oslo(50_000, items({ name: 'Chips', quantity: 3 }, { name: 'Apples', quantity: 4 })),
      oslo(50_000, items({ name: ' chips ', quantity: 2 }, { name: 'Bananas', quantity: 4 })),
      bengaluru(100_000, items({ name: 'CHIPS', quantity: 5 }, { name: 'Samosa', quantity: 1 })),
    ];

    const report = monthlyReport('2026-11', purchases, config);

    expect(report.bySnack.map(({ name, quantity }) => ({ name, quantity }))).toEqual([
      { name: 'Chips', quantity: 10 },
      { name: 'Apples', quantity: 4 }, // tie with Bananas: name ascending
      { name: 'Bananas', quantity: 4 },
      { name: 'Samosa', quantity: 1 },
    ]);
  });

  it('gives null spend for snacks that never had a price', () => {
    const report = monthlyReport('2026-11', [oslo(50_000, items({ name: 'Chips', quantity: 3 }))], config);

    expect(report.bySnack).toEqual([{ name: 'Chips', quantity: 3, spendInReportingCurrency: null }]);
  });

  it('sums only priced items, converting INR once per snack', () => {
    const purchases = [
      oslo(50_000, items({ name: 'Chips', quantity: 2, lineTotalMinor: 4_000 }, { name: 'Soda', quantity: 1 })),
      oslo(50_000, items({ name: 'chips', quantity: 1 })), // no price: adds quantity only
      // INR lines 200.05 + 300.10 = 500.15 INR, x 0.13 = 6501.95 -> 6502 øre.
      bengaluru(100_000, items({ name: 'Chips', quantity: 1, lineTotalMinor: 20_005 })),
      bengaluru(100_000, items({ name: 'CHIPS', quantity: 1, lineTotalMinor: 30_010 })),
    ];

    const chips = monthlyReport('2026-11', purchases, config).bySnack.find((line) => line.name === 'Chips');

    expect(chips).toEqual({
      name: 'Chips',
      quantity: 5,
      spendInReportingCurrency: { amountMinor: 4_000 + 6_502, currency: 'NOK' },
    });
  });

  it('rounds the INR part of a snack once, not per line', () => {
    // 3 lines of 500.05 INR: per line 3 x 6501 = 19,503 øre; once 19,502 øre.
    const purchases = [1, 2, 3].map(() =>
      bengaluru(50_005, items({ name: 'Tea', quantity: 1, lineTotalMinor: 50_005 })),
    );

    const [tea] = monthlyReport('2026-11', purchases, config).bySnack;

    expect(tea.spendInReportingCurrency).toEqual({ amountMinor: 19_502, currency: 'NOK' });
  });
});
