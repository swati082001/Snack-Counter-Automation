import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS } from '../../src/config';
import { Refill } from '../../src/domain/types';
import { budgetStatus } from '../../src/money/budgetTracker';
import { buildPurchase } from '../support/builders';
import { DEFAULT_ROSTER, buildTestContext, osloInput, reportAcceptAndBuy } from '../support/testContext';

// HR follow-up is driven through the coordinator (submitPurchase, tick,
// syncHrClaims), the same way the API and the scheduler use it.

const states = (refill: Refill) => refill.history.map((entry) => entry.to);

describe('HR claim lifecycle', () => {
  it('full happy path: report, offer, accept, purchase, claim, HR approves, sync, reimbursed', async () => {
    const ctx = await buildTestContext();
    const { refill, purchase } = await reportAcceptAndBuy(ctx, 'OSLO', osloInput());
    expect(refill.state).toBe('CLAIM_SUBMITTED');

    ctx.hr.approve('claim_1');
    await ctx.coordinator.syncHrClaims();

    const after = await ctx.coordinator.getRefill(refill.id);
    expect(after.state).toBe('REIMBURSED');
    expect(states(after)).toEqual([
      'REPORTED_EMPTY',
      'OPEN',
      'OPEN',
      'CLAIMED',
      'PURCHASED',
      'CLAIM_SUBMITTED',
      'REIMBURSED',
    ]);
    expect(after.history.at(-1)).toMatchObject({ event: 'HR_APPROVED', actor: 'hr' });
    expect((await ctx.purchases.get(purchase.id))?.hrStatus).toBe('APPROVED');
    expect(ctx.chat.messagesTo('anna').at(-1)?.text).toContain('HR approved');
  });

  it('leaves the claim pending while HR has not decided', async () => {
    const ctx = await buildTestContext();
    const { refill } = await reportAcceptAndBuy(ctx, 'OSLO', osloInput());

    await ctx.coordinator.syncHrClaims();

    expect((await ctx.coordinator.getRefill(refill.id)).state).toBe('CLAIM_SUBMITTED');
  });

  it('on HR rejection: state REJECTED, spend still counted, buyer and management told', async () => {
    const ctx = await buildTestContext();
    const { refill, purchase } = await reportAcceptAndBuy(ctx, 'OSLO', osloInput());

    ctx.hr.reject('claim_1');
    await ctx.coordinator.syncHrClaims();

    expect((await ctx.coordinator.getRefill(refill.id)).state).toBe('REJECTED');
    expect((await ctx.purchases.get(purchase.id))?.hrStatus).toBe('REJECTED');
    const spent = budgetStatus('OSLO', '2026-11', await ctx.purchases.list(), ctx.config).spent;
    expect(spent).toEqual({ amountMinor: 50_000, currency: 'NOK' });
    expect(ctx.chat.messagesTo('anna').at(-1)?.text).toContain('HR rejected');
    expect(ctx.chat.managementMessages().at(-1)?.text).toContain('HR rejected claim claim_1');
  });

  it('survives a timeout after HR recorded the claim: one claim, refill CLAIM_SUBMITTED', async () => {
    const ctx = await buildTestContext();
    ctx.hr.failAfterRecordingNext();

    const { refill, purchase } = await reportAcceptAndBuy(ctx, 'OSLO', osloInput());

    expect(refill.state).toBe('CLAIM_SUBMITTED');
    expect(purchase.hrSubmitAttempts).toBe(2);
    expect(ctx.hr.claimCount).toBe(1);
  });

  it('when every attempt fails: stays PURCHASED, management told once, and a later tick completes it', async () => {
    const ctx = await buildTestContext();
    ctx.hr.failNext(3);

    const { refill, purchase } = await reportAcceptAndBuy(ctx, 'OSLO', osloInput());
    expect(refill.state).toBe('PURCHASED');
    expect(purchase).toMatchObject({ hrStatus: 'NOT_SUBMITTED', hrClaimId: null, hrSubmitAttempts: 3 });
    expect(ctx.chat.managementMessages()).toHaveLength(1);

    // HR still down on the next tick: retried silently.
    ctx.hr.failNext(3);
    await ctx.coordinator.tick();
    expect((await ctx.coordinator.getRefill(refill.id)).state).toBe('PURCHASED');
    expect(ctx.chat.managementMessages()).toHaveLength(1);

    // HR back: the tick completes the submission with a single claim.
    await ctx.coordinator.tick();
    expect((await ctx.coordinator.getRefill(refill.id)).state).toBe('CLAIM_SUBMITTED');
    expect(await ctx.purchases.get(purchase.id)).toMatchObject({ hrStatus: 'PENDING', hrSubmitAttempts: 7 });
    expect(ctx.hr.claimCount).toBe(1);
  });

  it('also retries a failed submission on syncHrClaims', async () => {
    const ctx = await buildTestContext();
    ctx.hr.failNext(3);
    const { refill } = await reportAcceptAndBuy(ctx, 'OSLO', osloInput());

    await ctx.coordinator.syncHrClaims();

    expect((await ctx.coordinator.getRefill(refill.id)).state).toBe('CLAIM_SUBMITTED');
  });

  it('reminds management exactly once about a claim pending more than 10 days', async () => {
    const ctx = await buildTestContext();
    const { purchase } = await reportAcceptAndBuy(ctx, 'OSLO', osloInput());

    ctx.clock.advance(10 * DAY_MS);
    await ctx.coordinator.tick();
    expect(ctx.chat.managementMessages()).toHaveLength(0);

    ctx.clock.advance(HOUR_MS);
    await ctx.coordinator.tick();
    await ctx.coordinator.syncHrClaims();
    ctx.clock.advance(DAY_MS);
    await ctx.coordinator.tick();

    expect(ctx.chat.managementMessages()).toHaveLength(1);
    expect(ctx.chat.managementMessages()[0].text).toContain('pending for more than 10 days');
    expect((await ctx.purchases.get(purchase.id))?.hrReminderSentAt).toEqual(
      new Date(ctx.clock.now().getTime() - DAY_MS),
    );
  });

  it('skips a volunteer with a claim unpaid for more than 10 days when offering the next refill', async () => {
    const annaAndBjorn = DEFAULT_ROSTER.filter((volunteer) => ['anna', 'bjorn'].includes(volunteer.employeeId));
    const ctx = await buildTestContext(annaAndBjorn);
    await reportAcceptAndBuy(ctx, 'OSLO', osloInput()); // anna buys, claim stays pending
    // bjorn has done two (paid) refills, so on fairness alone anna would be asked next.
    for (const id of ['old_1', 'old_2']) {
      const paidRefill = buildPurchase({ id, buyerId: 'bjorn', purchasedAt: ctx.clock.now(), hrStatus: 'APPROVED' });
      await ctx.purchases.add(paidRefill);
    }

    ctx.clock.advance(10 * DAY_MS);
    const atTenDays = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    expect(atTenDays.currentOffer?.volunteerId).toBe('anna');
    await ctx.coordinator.cancelRefill(atTenDays.id, 'dina', 'test reset');

    ctx.clock.advance(HOUR_MS);
    const afterTenDays = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    expect(afterTenDays.currentOffer?.volunteerId).toBe('bjorn');
  });
});
