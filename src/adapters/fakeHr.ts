import { NotFoundError } from '../errors';
import { HrClaimRequest, HrClaimStatus, HrPort } from './hrPort';

interface StoredClaim {
  claimId: string;
  request: HrClaimRequest;
  status: HrClaimStatus;
}

// Stand-in for the external HR system. First version: just enough for the
// coordinator to compile and run. Failure injection and approve/reject
// helpers come with the HR gateway.
export class FakeHr implements HrPort {
  // Keyed by idempotency key: the same key always returns the same claim.
  private readonly claimsByKey = new Map<string, StoredClaim>();

  async submitClaim(req: HrClaimRequest, idempotencyKey: string): Promise<{ claimId: string }> {
    const existing = this.claimsByKey.get(idempotencyKey);
    if (existing) {
      return { claimId: existing.claimId };
    }
    const claimId = `claim_${this.claimsByKey.size + 1}`;
    this.claimsByKey.set(idempotencyKey, { claimId, request: structuredClone(req), status: 'PENDING' });
    return { claimId };
  }

  async getClaimStatus(claimId: string): Promise<HrClaimStatus> {
    const claim = [...this.claimsByKey.values()].find((stored) => stored.claimId === claimId);
    if (!claim) {
      throw new NotFoundError(`HR claim ${claimId} not found`);
    }
    return claim.status;
  }

  get claimCount(): number {
    return this.claimsByKey.size;
  }
}
