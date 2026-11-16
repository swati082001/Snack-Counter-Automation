import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config';
import { assessPurchase, budgetStatus } from '../../src/money/budgetTracker';
import { createMoney } from '../../src/money/money';
import { CurrencyMismatchError } from '../../src/errors';
import { Purchase } from '../../src/domain/types';
import { buildPurchase } from '../support/builders';

const config = DEFAULT_CONFIG;
const MID_NOVEMBER = new Date('2026-11-15T12:00:00.000Z');

function osloPurchase(id: string, amountMinor: number, overrides: Partial<Purchase> = {}): Purchase {
  return buildPurchase({
    id,
    office: 'OSLO',
    amount: createMoney(amountMinor, 'NOK'),
    purchasedAt: MID_NOVEMBER,
    ...overrides,
  });
}

function bengaluruPurchase(id: string, amountMinor: number, overrides: Partial<Purchase> = {}): Purchase {
  return buildPurchase({
    id,
    office: 'BENGALURU',
    buyerId: 'emp_blr_1',
    amount: createMoney(amountMinor, 'INR'),
    purchasedAt: MID_NOVEMBER,
    ...overrides,
  });
}

describe('budgetStatus', () => {
  it('REQUIRED: budgets and totals are correct across both currencies', () => {
    const purchases = [
      osloPurchase('p1', 120_000), // 1,200 NOK
      osloPurchase('p2', 330_000), // 3,300 NOK
      bengaluruPurchase('p3', 250_000), // 2,500 INR
      bengaluruPurchase('p4', 650_000), // 6,500 INR
    ];

    const oslo = budgetStatus('OSLO', '2026-11', purchases, config);
    const bengaluru = budgetStatus('BENGALURU', '2026-11', purchases, config);

    expect(oslo).toMatchObject({
      budget: { amountMinor: 600_000, currency: 'NOK' },
      spent: { amountMinor: 450_000, currency: 'NOK' },
      remaining: { amountMinor: 150_000, currency: 'NOK' },
      purchaseCount: 2,
      overBudget: false,
    });
    expect(bengaluru).toMatchObject({
      budget: { amountMinor: 1_500_000, currency: 'INR' },
      spent: { amountMinor: 900_000, currency: 'INR' },
      remaining: { amountMinor: 600_000, currency: 'INR' },
      purchaseCount: 2,
      overBudget: false,
    });

    // A large Bengaluru purchase changes only Bengaluru's budget.
    const withBigBengaluruBuy = [...purchases, bengaluruPurchase('p5', 1_000_000)];
    expect(budgetStatus('OSLO', '2026-11', withBigBengaluruBuy, config)).toEqual(oslo);
    expect(budgetStatus('BENGALURU', '2026-11', withBigBengaluruBuy, config)).toMatchObject({
      remaining: { amountMinor: -400_000, currency: 'INR' },
      overBudget: true,
    });
  });

  it("buckets purchases by month in the office's own time zone", () => {
    const purchases = [
      // 23:30 on 30 November in Oslo: still November there.
      osloPurchase('p1', 40_000, { purchasedAt: new Date('2026-11-30T22:30:00.000Z') }),
      // 00:30 on 1 December in Oslo: December, though it is still November in UTC.
      osloPurchase('p2', 70_000, { purchasedAt: new Date('2026-11-30T23:30:00.000Z') }),
    ];

    expect(budgetStatus('OSLO', '2026-11', purchases, config).spent.amountMinor).toBe(40_000);
    expect(budgetStatus('OSLO', '2026-12', purchases, config).spent.amountMinor).toBe(70_000);
  });

  it('excludes purchases from other months', () => {
    const purchases = [
      osloPurchase('p1', 50_000, { purchasedAt: new Date('2026-10-15T12:00:00.000Z') }),
      osloPurchase('p2', 60_000),
    ];

    const status = budgetStatus('OSLO', '2026-11', purchases, config);
    expect(status.spent.amountMinor).toBe(60_000);
    expect(status.purchaseCount).toBe(1);
  });

  it('counts purchases whatever their HR status, including rejected claims', () => {
    const purchases = [
      osloPurchase('p1', 10_000, { hrStatus: 'NOT_SUBMITTED' }),
      osloPurchase('p2', 20_000, { hrStatus: 'PENDING' }),
      osloPurchase('p3', 30_000, { hrStatus: 'APPROVED' }),
      osloPurchase('p4', 40_000, { hrStatus: 'REJECTED' }),
    ];

    expect(budgetStatus('OSLO', '2026-11', purchases, config).spent.amountMinor).toBe(100_000);
  });

  it('is over budget only when spend is above the budget, not equal to it', () => {
    const exactlyAtBudget = [osloPurchase('p1', 600_000)];
    const overByOneOre = [osloPurchase('p1', 600_001)];

    expect(budgetStatus('OSLO', '2026-11', exactlyAtBudget, config).overBudget).toBe(false);
    expect(budgetStatus('OSLO', '2026-11', overByOneOre, config).overBudget).toBe(true);
  });

  it('refuses to add a purchase stored in the wrong currency for its office', () => {
    const broken = [osloPurchase('p1', 10_000, { amount: createMoney(10_000, 'INR') })];

    expect(() => budgetStatus('OSLO', '2026-11', broken, config)).toThrow(CurrencyMismatchError);
  });
});

describe('assessPurchase', () => {
  const nok = (amountMinor: number) => createMoney(amountMinor, 'NOK');

  it('flags overBudget when month-to-date plus the new amount exceeds the budget', () => {
    const existing = [osloPurchase('p1', 500_000)];

    expect(assessPurchase('OSLO', nok(100_000), MID_NOVEMBER, existing, config).overBudget).toBe(false);
    expect(assessPurchase('OSLO', nok(100_001), MID_NOVEMBER, existing, config).overBudget).toBe(true);
  });

  it("checks against the new purchase's own month only", () => {
    const lastMonth = [osloPurchase('p1', 590_000, { purchasedAt: new Date('2026-10-15T12:00:00.000Z') })];

    expect(assessPurchase('OSLO', nok(100_000), MID_NOVEMBER, lastMonth, config).overBudget).toBe(false);
  });

  it('ignores the other office when checking the budget', () => {
    const bengaluruOnly = [bengaluruPurchase('p1', 1_400_000)];

    expect(assessPurchase('OSLO', nok(100_000), MID_NOVEMBER, bengaluruOnly, config).overBudget).toBe(false);
  });

  it.each([
    [29_999, true], // below 300 NOK
    [30_000, false], // exactly the typical minimum
    [120_000, false], // exactly the typical maximum
    [120_001, true], // above 1,200 NOK
  ])('flags unusualAmount for %i øre: %s', (amountMinor, expected) => {
    expect(assessPurchase('OSLO', nok(amountMinor), MID_NOVEMBER, [], config).unusualAmount).toBe(expected);
  });

  it('uses the Bengaluru typical range in INR', () => {
    const inr = (amountMinor: number) => createMoney(amountMinor, 'INR');

    expect(assessPurchase('BENGALURU', inr(49_999), MID_NOVEMBER, [], config).unusualAmount).toBe(true);
    expect(assessPurchase('BENGALURU', inr(300_000), MID_NOVEMBER, [], config).unusualAmount).toBe(false);
    expect(assessPurchase('BENGALURU', inr(300_001), MID_NOVEMBER, [], config).unusualAmount).toBe(true);
  });
});
