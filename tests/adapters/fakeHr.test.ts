import { describe, expect, it } from 'vitest';
import { FakeHr } from '../../src/adapters/fakeHr';
import { HrClaimRequest } from '../../src/adapters/hrPort';
import { NotFoundError } from '../../src/errors';

const REQUEST: HrClaimRequest = {
  employeeId: 'anna',
  amount: { amountMinor: 50_000, currency: 'NOK' },
  description: 'Snacks for OSLO, refill refill_1',
  receiptRef: 'receipt_1',
};

describe('FakeHr (first version)', () => {
  it('creates a pending claim and returns the same claim for the same idempotency key', async () => {
    const hr = new FakeHr();

    const first = await hr.submitClaim(REQUEST, 'refill_1');
    const retry = await hr.submitClaim(REQUEST, 'refill_1');
    const other = await hr.submitClaim(REQUEST, 'refill_2');

    expect(retry.claimId).toBe(first.claimId);
    expect(other.claimId).not.toBe(first.claimId);
    expect(hr.claimCount).toBe(2);
    expect(await hr.getClaimStatus(first.claimId)).toBe('PENDING');
  });

  it('throws NotFoundError for an unknown claim', async () => {
    await expect(new FakeHr().getClaimStatus('claim_404')).rejects.toThrow(NotFoundError);
  });
});
