import { Currency, Office } from './domain/types';

export interface OfficeConfig {
  currency: Currency;
  monthlyBudgetMinor: number;
  typicalMinMinor: number; // below this a purchase is flagged unusualAmount
  typicalMaxMinor: number; // above this a purchase is flagged unusualAmount
  timeZone: string; // IANA zone used to bucket purchases into months
}

export interface AppConfig {
  offerWindowMs: number;
  purchaseDeadlineMs: number;
  fairnessWindowDays: number;
  unpaidClaimSkipDays: number;
  hrReminderAfterDays: number;
  hrMaxSubmitAttempts: number;
  reportingCurrency: 'NOK';
  fxRates: { INR_TO_NOK: number };
  offices: Record<Office, OfficeConfig>;
}

const HOUR_MS = 60 * 60 * 1000;

export const DEFAULT_CONFIG: AppConfig = {
  offerWindowMs: 2 * HOUR_MS, // time to accept an offer
  purchaseDeadlineMs: 24 * HOUR_MS, // time to buy after accepting
  fairnessWindowDays: 90, 
  unpaidClaimSkipDays: 10, // HR takes up to 10 days
  hrReminderAfterDays: 10, // notify management if a claim is still pending
  hrMaxSubmitAttempts: 3,
  reportingCurrency: 'NOK', //  Oslo is the reporting base
  // Placeholder for tests and demos, not a market rate.
  fxRates: { INR_TO_NOK: 0.13 },
  offices: {
    OSLO: {
      currency: 'NOK',
      monthlyBudgetMinor: 600_000, // 6,000 NOK
      typicalMinMinor: 30_000, // 300 NOK
      typicalMaxMinor: 120_000, // 1,200 NOK
      timeZone: 'Europe/Oslo',
    },
    BENGALURU: {
      currency: 'INR',
      monthlyBudgetMinor: 1_500_000, // 15,000 INR
      typicalMinMinor: 50_000, // 500 INR
      typicalMaxMinor: 300_000, // 3,000 INR
      timeZone: 'Asia/Kolkata',
    },
  },
};
