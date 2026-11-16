import { AppConfig } from '../config';
import { Money, Office, Purchase } from '../domain/types';
import { addMoney, compareMoney, createMoney, subtractMoney, sumMoney } from './money';
import { monthKey } from './monthKey';

// Pure functions over a list of purchases: the caller loads purchases from the
// repository and passes them in, so this file needs no storage (see DECISIONS.md).

export interface BudgetStatus {
  office: Office;
  month: string; // 'YYYY-MM' in the office's time zone
  budget: Money;
  spent: Money;
  remaining: Money; // negative when over budget
  purchaseCount: number;
  overBudget: boolean;
}

export interface PurchaseFlags {
  overBudget: boolean;
  unusualAmount: boolean;
}

// Every purchase counts, whatever its HR status: a rejected claim was still
// money spent on snacks.
function purchasesInMonth(
  office: Office,
  month: string,
  purchases: readonly Purchase[],
  config: AppConfig,
): Purchase[] {
  const { timeZone } = config.offices[office];
  return purchases.filter(
    (purchase) => purchase.office === office && monthKey(purchase.purchasedAt, timeZone) === month,
  );
}

export function budgetStatus(
  office: Office,
  month: string,
  purchases: readonly Purchase[],
  config: AppConfig,
): BudgetStatus {
  const officeConfig = config.offices[office];
  const inMonth = purchasesInMonth(office, month, purchases, config);

  const budget = createMoney(officeConfig.monthlyBudgetMinor, officeConfig.currency);
  const spent = sumMoney(
    inMonth.map((purchase) => purchase.amount),
    officeConfig.currency,
  );

  return {
    office,
    month,
    budget,
    spent,
    remaining: subtractMoney(budget, spent),
    purchaseCount: inMonth.length,
    overBudget: compareMoney(spent, budget) > 0,
  };
}

// Flags for a new purchase, checked against the purchases already recorded.
// Neither flag blocks the purchase: an empty snack box is worse than a small
// overrun, and management is told about every flag.
export function assessPurchase(
  office: Office,
  amount: Money,
  purchasedAt: Date,
  existingPurchases: readonly Purchase[],
  config: AppConfig,
): PurchaseFlags {
  const officeConfig = config.offices[office];
  const month = monthKey(purchasedAt, officeConfig.timeZone);
  const status = budgetStatus(office, month, existingPurchases, config);

  const spentAfter = addMoney(status.spent, amount);
  const isBelowTypical = amount.amountMinor < officeConfig.typicalMinMinor;
  const isAboveTypical = amount.amountMinor > officeConfig.typicalMaxMinor;

  return {
    overBudget: compareMoney(spentAfter, status.budget) > 0,
    unusualAmount: isBelowTypical || isAboveTypical,
  };
}
