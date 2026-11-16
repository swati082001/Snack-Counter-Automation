import { describe, expect, it } from 'vitest';
import { FakeHr } from '../../src/adapters/fakeHr';
import { HrGateway } from '../../src/adapters/hrGateway';
import { HrPort } from '../../src/adapters/hrPort';
import { NotFoundError } from '../../src/errors';
import { buildPurchase } from '../support/builders';

const PURCHASE = buildPurchase({
  id: 'purchase_1',
  refillId: 'refill_1',
  buyerId: 'anna',
  office: 'OSLO',
  amount: { amountMinor: 54_900, currency: 'NOK' },
  items: [
    { name: 'Chips', quantity: 5 },
    { name: 'Soda', quantity: 2 },
  ],
  receiptRef: 'receipt_42',
});

describe('HrGateway', () => {
  it('sends employee, amount, currency, description and receipt, keyed by the refill id', async () => {
    const hr = new FakeHr();
    const gateway = new HrGateway(hr, 3);

    const result = await gateway.submit(PURCHASE);

    expect(result).toEqual({ ok: true, claimId: 'claim_1', attempts: 1 });
    expect(hr.requestFor('claim_1')).toEqual({
      employeeId: 'anna',
      amount: { amountMinor: 54_900, currency: 'NOK' },
      description: 'Snack refill refill_1 (OSLO): Chips x5, Soda x2',
      receiptRef: 'receipt_42',
    });
  });

  it('creates only one claim when the same refill is submitted twice', async () => {
    const hr = new FakeHr();
    const gateway = new HrGateway(hr, 3);

    const first = await gateway.submit(PURCHASE);
    const second = await gateway.submit(PURCHASE);

    expect(second).toEqual(first);
    expect(hr.claimCount).toBe(1);
  });

  it('retries after a timeout in which HR already recorded the claim, without a second claim', async () => {
    const hr = new FakeHr();
    const gateway = new HrGateway(hr, 3);
    hr.failAfterRecordingNext();

    const result = await gateway.submit(PURCHASE);

    expect(result).toEqual({ ok: true, claimId: 'claim_1', attempts: 2 });
    expect(hr.claimCount).toBe(1);
  });

  it('retries while HR is unavailable and succeeds on the last allowed attempt', async () => {
    const hr = new FakeHr();
    hr.failNext(2);

    const result = await new HrGateway(hr, 3).submit(PURCHASE);

    expect(result).toEqual({ ok: true, claimId: 'claim_1', attempts: 3 });
  });

  it('gives up after the maximum number of attempts', async () => {
    const hr = new FakeHr();
    hr.failNext(3);

    const result = await new HrGateway(hr, 3).submit(PURCHASE);

    expect(result).toEqual({ ok: false, attempts: 3 });
    expect(hr.claimCount).toBe(0);
  });

  it('does not retry errors other than HR being unavailable', async () => {
    let calls = 0;
    const brokenHr: HrPort = {
      submitClaim: async () => {
        calls += 1;
        throw new NotFoundError('unexpected');
      },
      getClaimStatus: async () => 'PENDING',
    };

    await expect(new HrGateway(brokenHr, 3).submit(PURCHASE)).rejects.toThrow(NotFoundError);
    expect(calls).toBe(1);
  });
});
