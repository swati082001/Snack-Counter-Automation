export type Office = 'OSLO' | 'BENGALURU';
export type Currency = 'NOK' | 'INR';

export interface Money {
  amountMinor: number; // integer minor units: øre for NOK, paise for INR 
  currency: Currency;
}

export type Availability = 'OFFICE' | 'REMOTE' | 'AWAY';

export interface Volunteer {
  employeeId: string;
  name: string;
  homeOffice: Office;
  payrollCurrency: Currency;
  currentOffice: Office; // differs from homeOffice while visiting 
  availability: Availability;
  optedIn: boolean;
}

export type RefillState =
  | 'REPORTED_EMPTY'
  | 'OPEN'
  | 'CLAIMED'
  | 'EXPIRED' // transient: recorded in history, never a resting state
  | 'PURCHASED'
  | 'CLAIM_SUBMITTED'
  | 'REIMBURSED'
  | 'REJECTED'
  | 'CANCELLED';

export interface Offer {
  volunteerId: string;
  offeredAt: Date;
  expiresAt: Date;
}

export interface HistoryEntry {
  at: Date;
  from: RefillState | null; // null only for the first entry, when the refill is created
  to: RefillState;
  event: string; // e.g. 'REPORTED', 'OFFER_ACCEPTED', 'OFFER_DECLINED', 'CLAIM_EXPIRED'
  actor: string; // employeeId, 'system' or 'hr'
}

export interface Refill {
  id: string;
  office: Office;
  state: RefillState;
  version: number; // optimistic locking: starts at 1, +1 per save
  reportedBy: string;
  createdAt: Date;
  currentOffer: Offer | null; // set while OPEN and someone is being asked
  excludedVolunteerIds: string[]; // declined, offer timed out, or claim expired
  claimedBy: string | null;
  claimDeadline: Date | null;
  purchaseId: string | null;
  history: HistoryEntry[];
}

export interface SnackItem {
  name: string;
  quantity: number; // positive integer
  lineTotalMinor?: number; // optional integer, in the purchase currency
}

export type HrStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Purchase {
  id: string;
  refillId: string;
  buyerId: string;
  office: Office;
  amount: Money;
  items: SnackItem[];
  receiptRef: string; // opaque reference to the receipt image
  purchasedAt: Date;
  overBudget: boolean; // flagged, never blocked 
  unusualAmount: boolean; // outside the office's typical range, flag only
  hrClaimId: string | null;
  hrStatus: HrStatus;
  hrSubmittedAt: Date | null;
  hrReminderSentAt: Date | null;
}

// What the buyer submits with the receipt 
export interface PurchaseInput {
  amountMinor: number;
  currency: Currency;
  items: SnackItem[];
  receiptRef: string;
}
