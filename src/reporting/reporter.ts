import { AppConfig } from '../config';
import { Currency, HrStatus, Money, Office, Purchase } from '../domain/types';
import { ValidationError } from '../errors';
import { budgetStatus, isInOfficeMonth } from '../money/budgetTracker';
import { addMoney, convertMoney, createMoney, zeroMoney } from '../money/money';

// The one monthly report management asked for: both offices in their own
// currency, plus a combined total in the reporting currency (NOK).
// Pure: the caller passes the purchases, so this file does no I/O.

export interface OfficeReport {
  office: Office;
  currency: Currency;
  budgetMinor: number;
  spentMinor: number; // in the office's own currency
  remainingMinor: number; // negative when over budget
  purchaseCount: number;
  overBudget: boolean;
}

export interface SnackLine {
  name: string;
  quantity: number;
  spendInReportingCurrency: Money | null; // null when no item of this name had a price
}

export interface MonthlyReport {
  month: string;
  reportingCurrency: 'NOK';
  fxRate: { from: 'INR'; to: 'NOK'; rate: number };
  offices: OfficeReport[];
  combinedTotal: Money;
  bySnack: SnackLine[];
  statusCounts: { pendingHr: number; reimbursed: number; rejected: number };
}

const OFFICES: readonly Office[] = ['OSLO', 'BENGALURU'];
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function monthlyReport(month: string, purchases: readonly Purchase[], config: AppConfig): MonthlyReport {
  if (!MONTH_PATTERN.test(month)) {
    throw new ValidationError(`Month must look like YYYY-MM, got "${month}"`);
  }
  const inMonth = purchases.filter((purchase) => isInOfficeMonth(purchase, month, config));
  const offices = OFFICES.map((office) => officeReport(office, month, inMonth, config));

  // Each office total is converted once, never purchase by purchase, so
  // rounding happens once per office and cannot add up.
  const combinedTotal = offices.reduce(
    (total, office) => addMoney(total, toReportingCurrency(createMoney(office.spentMinor, office.currency), config)),
    zeroMoney(config.reportingCurrency),
  );

  return {
    month,
    reportingCurrency: config.reportingCurrency,
    fxRate: { from: 'INR', to: 'NOK', rate: config.fxRates.INR_TO_NOK },
    offices,
    combinedTotal,
    bySnack: snackLines(inMonth, config),
    statusCounts: {
      // Still waiting for their money, including claims HR has not received yet.
      pendingHr: countWithHrStatus(inMonth, ['PENDING', 'NOT_SUBMITTED']),
      reimbursed: countWithHrStatus(inMonth, ['APPROVED']),
      rejected: countWithHrStatus(inMonth, ['REJECTED']),
    },
  };
}

function countWithHrStatus(purchases: readonly Purchase[], statuses: readonly HrStatus[]): number {
  return purchases.filter((purchase) => statuses.includes(purchase.hrStatus)).length;
}

// Rejected claims are included: the money was spent either way.
function officeReport(office: Office, month: string, purchases: readonly Purchase[], config: AppConfig): OfficeReport {
  const status = budgetStatus(office, month, purchases, config);
  return {
    office,
    currency: status.budget.currency,
    budgetMinor: status.budget.amountMinor,
    spentMinor: status.spent.amountMinor,
    remainingMinor: status.remaining.amountMinor,
    purchaseCount: status.purchaseCount,
    overBudget: status.overBudget,
  };
}

// Only two currencies exist and NOK is the reporting currency, so the one
// configured rate (INR to NOK) covers every conversion.
function toReportingCurrency(amount: Money, config: AppConfig): Money {
  return convertMoney(amount, config.reportingCurrency, config.fxRates.INR_TO_NOK);
}

interface SnackTotals {
  name: string; // first spelling seen, for display
  quantity: number;
  pricedMinorByCurrency: Map<Currency, number>; // only items that had a line total
}

// Groups snacks by name, ignoring case and surrounding spaces ("Chips" and
// " chips " are the same snack). Priced amounts are summed per currency and
// converted once per snack, the same rule as the office totals.
function snackLines(purchases: readonly Purchase[], config: AppConfig): SnackLine[] {
  const byKey = new Map<string, SnackTotals>();

  for (const purchase of purchases) {
    for (const item of purchase.items) {
      const key = item.name.trim().toLowerCase();
      const totals = byKey.get(key) ?? { name: item.name.trim(), quantity: 0, pricedMinorByCurrency: new Map() };
      totals.quantity += item.quantity;
      if (item.lineTotalMinor !== undefined) {
        const currency = purchase.amount.currency;
        const soFar = totals.pricedMinorByCurrency.get(currency) ?? 0;
        totals.pricedMinorByCurrency.set(currency, soFar + item.lineTotalMinor);
      }
      byKey.set(key, totals);
    }
  }

  // Most eaten first; ties by name. Keys are unique, so two keys are never equal.
  return [...byKey.entries()]
    .sort(([keyA, a], [keyB, b]) => b.quantity - a.quantity || (keyA < keyB ? -1 : 1))
    .map(([, totals]) => ({
      name: totals.name,
      quantity: totals.quantity,
      spendInReportingCurrency: snackSpend(totals, config),
    }));
}

function snackSpend(totals: SnackTotals, config: AppConfig): Money | null {
  if (totals.pricedMinorByCurrency.size === 0) {
    return null;
  }
  let spend = zeroMoney(config.reportingCurrency);
  for (const [currency, amountMinor] of totals.pricedMinorByCurrency) {
    spend = addMoney(spend, toReportingCurrency(createMoney(amountMinor, currency), config));
  }
  return spend;
}
