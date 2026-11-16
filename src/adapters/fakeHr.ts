import { HrUnavailableError, NotFoundError } from '../errors';
import { HrClaimRequest, HrClaimStatus, HrPort } from './hrPort';

interface StoredClaim {
  claimId: string;
  request: HrClaimRequest;
  status: HrClaimStatus;
}

// Stand-in for the external HR system. Behaves like a well-behaved HR API
// (idempotent submit, status lookup) and lets tests and the demo approve,
// reject, or make it fail on purpose.
export class FakeHr implements HrPort {
  // Keyed by idempotency key: the same key always returns the same claim.
  private readonly claimsByKey = new Map<string, StoredClaim>();
  private failuresBeforeRecording = 0;
  private failAfterRecording = false;

  async submitClaim(req: HrClaimRequest, idempotencyKey: string): Promise<{ claimId: string }> {
    if (this.failuresBeforeRecording > 0) {
      this.failuresBeforeRecording -= 1;
      throw new HrUnavailableError('HR system unavailable (simulated)');
    }

    const claim = this.claimsByKey.get(idempotencyKey) ?? this.record(req, idempotencyKey);

    if (this.failAfterRecording) {
      this.failAfterRecording = false;
      throw new HrUnavailableError('HR timed out after recording the claim (simulated)');
    }
    return { claimId: claim.claimId };
  }

  async getClaimStatus(claimId: string): Promise<HrClaimStatus> {
    return this.findClaim(claimId).status;
  }

  approve(claimId: string): void {
    this.findClaim(claimId).status = 'APPROVED';
  }

  reject(claimId: string): void {
    this.findClaim(claimId).status = 'REJECTED';
  }

  // The next `count` submissions fail before HR records anything.
  failNext(count: number): void {
    this.failuresBeforeRecording = count;
  }

  // The next submission is recorded by HR, but the caller gets an error, as
  // if the response was lost in a timeout. A retry must not create a second claim.
  failAfterRecordingNext(): void {
    this.failAfterRecording = true;
  }

  requestFor(claimId: string): HrClaimRequest {
    return structuredClone(this.findClaim(claimId).request);
  }

  get claimCount(): number {
    return this.claimsByKey.size;
  }

  private record(req: HrClaimRequest, idempotencyKey: string): StoredClaim {
    const claim: StoredClaim = {
      claimId: `claim_${this.claimsByKey.size + 1}`,
      request: structuredClone(req),
      status: 'PENDING',
    };
    this.claimsByKey.set(idempotencyKey, claim);
    return claim;
  }

  private findClaim(claimId: string): StoredClaim {
    const claim = [...this.claimsByKey.values()].find((stored) => stored.claimId === claimId);
    if (!claim) {
      throw new NotFoundError(`HR claim ${claimId} not found`);
    }
    return claim;
  }
}
