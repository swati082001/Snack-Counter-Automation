import { Purchase } from '../domain/types';
import { HrUnavailableError } from '../errors';
import { HrClaimRequest, HrClaimStatus, HrPort } from './hrPort';

export type HrSubmitResult =
  | { ok: true; claimId: string; attempts: number }
  | { ok: false; attempts: number };

// Wraps the HR system: builds the claim from a purchase, retries when HR is
// unavailable, and always sends the refill id as the idempotency key. So a
// retry after a lost response returns the claim HR already made instead of
// creating a second one.
export class HrGateway {
  constructor(
    private readonly hr: HrPort,
    private readonly maxAttempts: number,
  ) {}

  async submit(purchase: Purchase): Promise<HrSubmitResult> {
    const request = toClaimRequest(purchase);

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const { claimId } = await this.hr.submitClaim(request, purchase.refillId);
        return { ok: true, claimId, attempts: attempt };
      } catch (error) {
        // Only "HR is unavailable" is worth retrying; anything else is a bug.
        if (!(error instanceof HrUnavailableError)) {
          throw error;
        }
      }
    }
    return { ok: false, attempts: this.maxAttempts };
  }

  async status(claimId: string): Promise<HrClaimStatus> {
    return this.hr.getClaimStatus(claimId);
  }
}

// HR gets the purchase amount in the currency it was paid in; HR converts
// it to the employee's payroll currency.
function toClaimRequest(purchase: Purchase): HrClaimRequest {
  const itemList = purchase.items.map((item) => `${item.name} x${item.quantity}`).join(', ');
  return {
    employeeId: purchase.buyerId,
    amount: purchase.amount,
    description: `Snack refill ${purchase.refillId} (${purchase.office}): ${itemList}`,
    receiptRef: purchase.receiptRef,
  };
}
