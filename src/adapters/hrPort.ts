import { Money } from '../domain/types';

// The external HR system, as the core sees it. It is run by another company,
// so the core only relies on what the brief says it accepts.

export interface HrClaimRequest {
  employeeId: string;
  amount: Money; // purchase amount and currency; HR converts to payroll currency
  description: string;
  receiptRef: string;
}

export type HrClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface HrPort {
  // The same idempotency key must never create a second claim, so a retry
  // after a timeout is safe.
  submitClaim(req: HrClaimRequest, idempotencyKey: string): Promise<{ claimId: string }>;
  getClaimStatus(claimId: string): Promise<HrClaimStatus>;
}
