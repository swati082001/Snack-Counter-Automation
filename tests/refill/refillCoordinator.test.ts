import { describe, expect, it } from 'vitest';
import { HOUR_MS } from '../../src/config';
import { Refill, RefillState } from '../../src/domain/types';
import {
  AlreadyClaimedError,
  InvalidStateError,
  NotFoundError,
  NotOfferedToYouError,
  ValidationError,
} from '../../src/errors';
import { TestContext, buildTestContext } from '../support/testContext';

const MINUTE_MS = 60 * 1000;

const events = (refill: Refill) => refill.history.map((entry) => entry.event);
const states = (refill: Refill) => refill.history.map((entry) => entry.to);

// Moves a refill straight to a later state, for tests about what may happen
// after a purchase (purchases themselves come with the HR gateway).
async function forceState(ctx: TestContext, refillId: string, state: RefillState): Promise<void> {
  const refill = await ctx.coordinator.getRefill(refillId);
  await ctx.refills.save({ ...refill, state, currentOffer: null }, refill.version);
}

async function setAvailability(ctx: TestContext, employeeId: string, availability: 'OFFICE' | 'REMOTE' | 'AWAY') {
  const volunteer = await ctx.volunteers.get(employeeId);
  if (!volunteer) throw new Error(`test setup: unknown volunteer ${employeeId}`);
  await ctx.volunteers.upsert({ ...volunteer, availability });
}

describe('reportEmpty', () => {
  it('creates an open refill and offers it to the fairest volunteer in that office', async () => {
    const ctx = await buildTestContext();

    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');

    expect(refill).toMatchObject({ id: 'refill_1', office: 'OSLO', state: 'OPEN', reportedBy: 'dina', version: 1 });
    expect(refill.currentOffer).toEqual({
      volunteerId: 'anna',
      offeredAt: ctx.clock.now(),
      expiresAt: new Date(ctx.clock.now().getTime() + 2 * HOUR_MS),
    });
    expect(states(refill)).toEqual(['REPORTED_EMPTY', 'OPEN', 'OPEN']);
    expect(events(refill)).toEqual(['REPORTED', 'OPENED', 'OFFERED']);
  });

  it('sends the offer by direct message with refill id, office, accept deadline and budget left', async () => {
    const ctx = await buildTestContext();

    await ctx.coordinator.reportEmpty('OSLO', 'dina');

    const [offer] = ctx.chat.messagesTo('anna');
    expect(offer.text).toContain('refill_1');
    expect(offer.text).toContain('OSLO');
    expect(offer.text).toContain('16 Nov, 12:00'); // 10:00 in Oslo + 2 hours
    expect(offer.text).toContain('6,000.00 NOK');
  });

  it('returns the same refill for a second report of the same office and creates no second one', async () => {
    const ctx = await buildTestContext();

    const first = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    const second = await ctx.coordinator.reportEmpty('OSLO', 'bjorn');

    expect(second.id).toBe(first.id);
    expect(await ctx.refills.list()).toHaveLength(1);
    expect(ctx.chat.messagesTo('anna')).toHaveLength(1);
  });

  it('collapses two reports arriving at the same moment into one refill', async () => {
    const ctx = await buildTestContext();

    const [first, second] = await Promise.all([
      ctx.coordinator.reportEmpty('OSLO', 'dina'),
      ctx.coordinator.reportEmpty('OSLO', 'bjorn'),
    ]);

    expect(second.id).toBe(first.id);
    expect(await ctx.refills.list()).toHaveLength(1);
    expect(ctx.chat.messagesTo('anna')).toHaveLength(1);
  });

  it('keeps the two offices separate', async () => {
    const ctx = await buildTestContext();

    const oslo = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    const bengaluru = await ctx.coordinator.reportEmpty('BENGALURU', 'ravi');

    expect(bengaluru.id).not.toBe(oslo.id);
    expect(bengaluru.currentOffer?.volunteerId).toBe('ravi');
  });

  it('creates a new refill once the previous one is purchased, though its HR claim is still open', async () => {
    const ctx = await buildTestContext();
    const first = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    await forceState(ctx, first.id, 'PURCHASED');

    const second = await ctx.coordinator.reportEmpty('OSLO', 'dina');

    expect(second.id).not.toBe(first.id);
    expect(second.state).toBe('OPEN');
  });
});

describe('acceptOffer', () => {
  it('REQUIRED: two people cannot both commit to the same refill', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');

    const results = await Promise.allSettled([
      ctx.coordinator.acceptOffer(refill.id, 'anna'),
      ctx.coordinator.acceptOffer(refill.id, 'bjorn'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: expect.any(NotOfferedToYouError) });
    const stored = await ctx.coordinator.getRefill(refill.id);
    expect(stored.state).toBe('CLAIMED');
    expect(stored.claimedBy).toBe('anna');
  });

  it('REQUIRED: two people cannot both commit to the same refill, even when both pass the checks at once', async () => {
    // Two accepts for the same offer (for example a double tap) both read the
    // refill before either saves. Only the version check stops the second one.
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');

    const results = await Promise.allSettled([
      ctx.coordinator.acceptOffer(refill.id, 'anna'),
      ctx.coordinator.acceptOffer(refill.id, 'anna'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toEqual([
      { status: 'rejected', reason: expect.any(AlreadyClaimedError) },
    ]);
    const stored = await ctx.coordinator.getRefill(refill.id);
    expect(stored.claimedBy).toBe('anna');
    expect(events(stored).filter((event) => event === 'OFFER_ACCEPTED')).toHaveLength(1);
  });

  it('claims the refill with a 24 hour deadline and confirms by direct message', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');

    const claimed = await ctx.coordinator.acceptOffer(refill.id, 'anna');

    expect(claimed).toMatchObject({
      state: 'CLAIMED',
      claimedBy: 'anna',
      currentOffer: null,
      claimDeadline: new Date(ctx.clock.now().getTime() + 24 * HOUR_MS),
      version: 2,
    });
    expect(events(claimed).at(-1)).toBe('OFFER_ACCEPTED');
    expect(ctx.chat.messagesTo('anna').at(-1)?.text).toContain('17 Nov, 10:00');
  });

  it('only lets the named person accept', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');

    await expect(ctx.coordinator.acceptOffer(refill.id, 'bjorn')).rejects.toThrow(NotOfferedToYouError);
  });

  it('refuses an accept once the refill is already claimed', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    await ctx.coordinator.acceptOffer(refill.id, 'anna');

    await expect(ctx.coordinator.acceptOffer(refill.id, 'anna')).rejects.toThrow(AlreadyClaimedError);
  });

  it('refuses an accept after the offer window, and tick offers it to someone else', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    ctx.clock.advance(2 * HOUR_MS);

    await expect(ctx.coordinator.acceptOffer(refill.id, 'anna')).rejects.toThrow(NotOfferedToYouError);

    await ctx.coordinator.tick();
    const after = await ctx.coordinator.getRefill(refill.id);
    expect(after.currentOffer?.volunteerId).toBe('bjorn');
    expect(after.excludedVolunteerIds).toEqual(['anna']);
  });

  it('throws NotFoundError for an unknown refill', async () => {
    const ctx = await buildTestContext();

    await expect(ctx.coordinator.acceptOffer('refill_404', 'anna')).rejects.toThrow(NotFoundError);
  });
});

describe('declineOffer', () => {
  it('offers to the next candidate immediately and excludes the decliner', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');

    const after = await ctx.coordinator.declineOffer(refill.id, 'anna');

    expect(after.currentOffer?.volunteerId).toBe('bjorn');
    expect(after.excludedVolunteerIds).toEqual(['anna']);
    expect(events(after).slice(-2)).toEqual(['OFFER_DECLINED', 'OFFERED']);
    expect(ctx.chat.messagesTo('bjorn')).toHaveLength(1);
  });

  it('only lets the named person decline', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');

    await expect(ctx.coordinator.declineOffer(refill.id, 'bjorn')).rejects.toThrow(NotOfferedToYouError);
  });
});

describe('tick: deadlines and hand-over', () => {
  it('REQUIRED: a refill nobody completes is handed to someone else', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    await ctx.coordinator.acceptOffer(refill.id, 'anna');

    ctx.clock.advance(24 * HOUR_MS + MINUTE_MS);
    await ctx.coordinator.tick();

    const after = await ctx.coordinator.getRefill(refill.id);
    const claimedAt = states(after).indexOf('CLAIMED');
    expect(states(after).slice(claimedAt, claimedAt + 3)).toEqual(['CLAIMED', 'EXPIRED', 'OPEN']);
    expect(after.state).toBe('OPEN');
    expect(after.claimedBy).toBeNull();
    expect(after.excludedVolunteerIds).toContain('anna');
    expect(after.currentOffer?.volunteerId).toBe('bjorn');
    expect(ctx.chat.messagesTo('bjorn')).toHaveLength(1);
    expect(ctx.chat.messagesTo('anna').at(-1)?.text).toContain('passed its deadline');
  });

  it('does nothing to a claim before its deadline', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    const claimed = await ctx.coordinator.acceptOffer(refill.id, 'anna');

    ctx.clock.advance(24 * HOUR_MS - MINUTE_MS);
    await ctx.coordinator.tick();

    expect(await ctx.coordinator.getRefill(refill.id)).toEqual(claimed);
  });

  it('moves to the next person when an offer is ignored for 2 hours', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');

    ctx.clock.advance(2 * HOUR_MS);
    await ctx.coordinator.tick();

    const after = await ctx.coordinator.getRefill(refill.id);
    expect(after.currentOffer?.volunteerId).toBe('bjorn');
    expect(after.excludedVolunteerIds).toEqual(['anna']);
    expect(events(after).slice(-2)).toEqual(['OFFER_EXPIRED', 'OFFERED']);
  });

  it('is safe to call repeatedly: a second tick changes nothing', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    ctx.clock.advance(2 * HOUR_MS);

    await ctx.coordinator.tick();
    const afterFirstTick = await ctx.coordinator.getRefill(refill.id);
    const messageCount = ctx.chat.outbox.length;
    await ctx.coordinator.tick();

    expect(await ctx.coordinator.getRefill(refill.id)).toEqual(afterFirstTick);
    expect(ctx.chat.outbox).toHaveLength(messageCount);
  });
});

describe('when nobody is eligible', () => {
  it('stays open without an offer, tells office and management once, and offers later when someone is available', async () => {
    const ctx = await buildTestContext();
    for (const id of ['anna', 'bjorn', 'carl']) {
      await setAvailability(ctx, id, 'AWAY');
    }

    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    expect(refill.state).toBe('OPEN');
    expect(refill.currentOffer).toBeNull();

    await ctx.coordinator.tick();
    await ctx.coordinator.tick();
    expect(ctx.chat.officeMessages('OSLO')).toHaveLength(1);
    expect(ctx.chat.managementMessages()).toHaveLength(1);

    await setAvailability(ctx, 'carl', 'OFFICE');
    await ctx.coordinator.tick();

    const after = await ctx.coordinator.getRefill(refill.id);
    expect(after.currentOffer?.volunteerId).toBe('carl');
    expect(ctx.chat.messagesTo('carl')).toHaveLength(1);
  });

  it('asks excluded volunteers again once the refill is more than 24 hours old', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    await ctx.coordinator.declineOffer(refill.id, 'anna');
    await ctx.coordinator.declineOffer(refill.id, 'bjorn');
    const allDeclined = await ctx.coordinator.declineOffer(refill.id, 'carl');
    expect(allDeclined.currentOffer).toBeNull();
    expect(ctx.chat.managementMessages()).toHaveLength(1);

    // Exactly 24 hours after the report: not yet.
    ctx.clock.advance(24 * HOUR_MS);
    await ctx.coordinator.tick();
    expect((await ctx.coordinator.getRefill(refill.id)).currentOffer).toBeNull();

    ctx.clock.advance(MINUTE_MS);
    await ctx.coordinator.tick();

    const after = await ctx.coordinator.getRefill(refill.id);
    expect(after.excludedVolunteerIds).toEqual([]);
    expect(after.currentOffer?.volunteerId).toBe('anna');
    expect(events(after).slice(-2)).toEqual(['EXCLUSIONS_CLEARED', 'OFFERED']);
    expect(ctx.chat.managementMessages()).toHaveLength(1);
  });
});

describe('cancelRefill', () => {
  it('cancels an open refill and tells the person holding the offer', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');

    const cancelled = await ctx.coordinator.cancelRefill(refill.id, 'carl', 'I refilled it myself');

    expect(cancelled).toMatchObject({ state: 'CANCELLED', currentOffer: null });
    expect(events(cancelled).at(-1)).toBe('CANCELLED');
    expect(ctx.chat.messagesTo('anna').at(-1)?.text).toContain('I refilled it myself');
  });

  it('cancels a claimed refill and tells the claimer', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    await ctx.coordinator.acceptOffer(refill.id, 'anna');

    const cancelled = await ctx.coordinator.cancelRefill(refill.id, 'carl', 'Box was restocked');

    expect(cancelled).toMatchObject({ state: 'CANCELLED', claimedBy: null, claimDeadline: null });
    expect(ctx.chat.messagesTo('anna').at(-1)?.text).toContain('Box was restocked');
  });

  it('lets the office report a new empty box after a cancel', async () => {
    const ctx = await buildTestContext();
    const first = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    await ctx.coordinator.cancelRefill(first.id, 'carl', 'Refilled');

    const second = await ctx.coordinator.reportEmpty('OSLO', 'dina');

    expect(second.id).not.toBe(first.id);
  });

  it('refuses to cancel a purchased refill', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');
    await forceState(ctx, refill.id, 'PURCHASED');

    await expect(ctx.coordinator.cancelRefill(refill.id, 'carl', 'Changed my mind')).rejects.toThrow(
      InvalidStateError,
    );
  });

  it('requires a reason', async () => {
    const ctx = await buildTestContext();
    const refill = await ctx.coordinator.reportEmpty('OSLO', 'dina');

    await expect(ctx.coordinator.cancelRefill(refill.id, 'carl', '   ')).rejects.toThrow(ValidationError);
  });
});
