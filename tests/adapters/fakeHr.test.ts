import { describe, expect, it } from 'vitest';
import { FakeHr } from '../../src/adapters/fakeHr';
import { HrClaimRequest } from '../../src/adapters/hrPort';
import { HrUnavailableError, NotFoundError } from '../../src/errors';

const REQUEST: HrClaimRequest = {
  employeeId: 'anna',
  amount: { amountMinor: 50_000, currency: 'NOK' },
  description: 'Snack refill refill_1 (OSLO): Chips x5',
  receiptRef: 'receipt_1',
};

describe('FakeHr', () => {
  it('creates a pending claim and returns the same claim for the same idempotency key', async () => {
    const hr = new FakeHr();

    const first = await hr.submitClaim(REQUEST, 'refill_1');
    const retry = await hr.submitClaim(REQUEST, 'refill_1');
    const other = await hr.submitClaim(REQUEST, 'refill_2');

    expect(retry.claimId).toBe(first.claimId);
    expect(other.claimId).not.toBe(first.claimId);
    expect(hr.claimCount).toBe(2);
    expect(await hr.getClaimStatus(first.claimId)).toBe('PENDING');
    expect(hr.requestFor(first.claimId)).toEqual(REQUEST);
  });

  it('approves and rejects claims', async () => {
    const hr = new FakeHr();
    const { claimId: approved } = await hr.submitClaim(REQUEST, 'refill_1');
    const { claimId: rejected } = await hr.submitClaim(REQUEST, 'refill_2');

    hr.approve(approved);
    hr.reject(rejected);

    expect(await hr.getClaimStatus(approved)).toBe('APPROVED');
    expect(await hr.getClaimStatus(rejected)).toBe('REJECTED');
  });

  it('failNext(n) fails the next n submissions before recording anything', async () => {
    const hr = new FakeHr();
    hr.failNext(2);

    await expect(hr.submitClaim(REQUEST, 'refill_1')).rejects.toThrow(HrUnavailableError);
    await expect(hr.submitClaim(REQUEST, 'refill_1')).rejects.toThrow(HrUnavailableError);
    expect(hr.claimCount).toBe(0);

    await hr.submitClaim(REQUEST, 'refill_1');
    expect(hr.claimCount).toBe(1);
  });

  it('failAfterRecordingNext() records the claim, then fails once', async () => {
    const hr = new FakeHr();
    hr.failAfterRecordingNext();

    await expect(hr.submitClaim(REQUEST, 'refill_1')).rejects.toThrow(HrUnavailableError);
    expect(hr.claimCount).toBe(1);

    const retry = await hr.submitClaim(REQUEST, 'refill_1');
    expect(retry.claimId).toBe('claim_1');
    expect(hr.claimCount).toBe(1);
  });

  it('throws NotFoundError for an unknown claim', async () => {
    const hr = new FakeHr();

    await expect(hr.getClaimStatus('claim_404')).rejects.toThrow(NotFoundError);
    expect(() => hr.approve('claim_404')).toThrow(NotFoundError);
  });
});
