import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config';
import { Purchase, Refill, Volunteer } from '../../src/domain/types';
import { PickNextInput, pickNext } from '../../src/volunteers/assignmentEngine';
import { buildPurchase, buildRefill, buildVolunteer } from '../support/builders';

const NOW = new Date('2026-11-16T09:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

const OSLO_REFILL = buildRefill({ id: 'refill_oslo', office: 'OSLO' });

let purchaseCounter = 0;
function refillBy(buyerId: string, purchasedAt: Date, overrides: Partial<Purchase> = {}): Purchase {
  purchaseCounter += 1;
  return buildPurchase({ id: `purchase_${purchaseCounter}`, buyerId, purchasedAt, ...overrides });
}

function pick(overrides: Partial<PickNextInput>): string | null {
  const input: PickNextInput = {
    refill: OSLO_REFILL,
    volunteers: [],
    purchases: [],
    activeRefills: [OSLO_REFILL],
    now: NOW,
    config: DEFAULT_CONFIG,
    ...overrides,
  };
  return pickNext(input)?.employeeId ?? null;
}

const anna = buildVolunteer({ employeeId: 'anna' });
const bjorn = buildVolunteer({ employeeId: 'bjorn' });
const carl = buildVolunteer({ employeeId: 'carl' });

describe('pickNext: fairness order', () => {
  it('picks the volunteer with the fewest refills in the last 90 days', () => {
    const purchases = [
      refillBy('anna', daysAgo(5)),
      refillBy('anna', daysAgo(20)),
      refillBy('bjorn', daysAgo(30)),
      refillBy('carl', daysAgo(1)),
      refillBy('carl', daysAgo(2)),
    ];

    expect(pick({ volunteers: [anna, bjorn, carl], purchases })).toBe('bjorn');
  });

  it('breaks a tie by the oldest last refill', () => {
    const purchases = [refillBy('anna', daysAgo(3)), refillBy('bjorn', daysAgo(40))];

    expect(pick({ volunteers: [anna, bjorn], purchases })).toBe('bjorn');
  });

  it('puts a volunteer who never refilled before one with an old refill', () => {
    // Both have zero refills in the window; only bjorn ever refilled.
    const purchases = [refillBy('bjorn', daysAgo(200))];

    expect(pick({ volunteers: [bjorn, carl], purchases })).toBe('carl');
  });

  it('breaks a full tie by employeeId', () => {
    expect(pick({ volunteers: [carl, bjorn, anna] })).toBe('anna');
  });

  it('stops counting refills older than 90 days against fairness', () => {
    // anna's two refills are 91 days old and no longer count; bjorn has one recent refill.
    const purchases = [
      refillBy('anna', daysAgo(91)),
      refillBy('anna', daysAgo(95)),
      refillBy('bjorn', daysAgo(5)),
    ];

    expect(pick({ volunteers: [anna, bjorn], purchases })).toBe('anna');
  });

  it('still counts a refill exactly 90 days old', () => {
    // If the 90-day-old refill counts, anna has 2 refills and bjorn 1, so bjorn is picked.
    // If it did not count, both would have 1 and anna (older last refill) would be picked.
    const purchases = [
      refillBy('anna', daysAgo(90)),
      refillBy('anna', daysAgo(5)),
      refillBy('bjorn', daysAgo(1)),
    ];

    expect(pick({ volunteers: [anna, bjorn], purchases })).toBe('bjorn');
  });

  it('counts refills made in any office', () => {
    // A visitor's refills back home still count towards how much they have done.
    const purchases = [refillBy('anna', daysAgo(10), { office: 'BENGALURU' })];

    expect(pick({ volunteers: [anna, bjorn], purchases })).toBe('bjorn');
  });

  it('gives the same answer whatever order the volunteers are listed in', () => {
    const purchases = [refillBy('anna', daysAgo(3))];

    expect(pick({ volunteers: [anna, bjorn, carl], purchases })).toBe('bjorn');
    expect(pick({ volunteers: [carl, anna, bjorn], purchases })).toBe('bjorn');
  });
});

describe('pickNext: who is eligible', () => {
  it('skips REMOTE, AWAY and opted-out volunteers', () => {
    const remote = buildVolunteer({ employeeId: 'a_remote', availability: 'REMOTE' });
    const away = buildVolunteer({ employeeId: 'b_away', availability: 'AWAY' });
    const optedOut = buildVolunteer({ employeeId: 'c_opted_out', optedIn: false });
    const inOffice = buildVolunteer({ employeeId: 'z_in_office' });

    expect(pick({ volunteers: [remote, away, optedOut, inOffice] })).toBe('z_in_office');
    expect(pick({ volunteers: [remote, away, optedOut] })).toBeNull();
  });

  it('skips volunteers excluded from this refill', () => {
    const refill = buildRefill({ excludedVolunteerIds: ['anna', 'bjorn'] });

    expect(pick({ refill, activeRefills: [refill], volunteers: [anna, bjorn, carl] })).toBe('carl');
  });

  it('skips a volunteer with an active offer on another refill', () => {
    const otherRefill = buildRefill({
      id: 'refill_other',
      currentOffer: { volunteerId: 'anna', offeredAt: daysAgo(0), expiresAt: NOW },
    });

    expect(pick({ volunteers: [anna, bjorn], activeRefills: [OSLO_REFILL, otherRefill] })).toBe('bjorn');
  });

  it('skips a volunteer holding a claim, but not one whose refill is already purchased', () => {
    const claimed = buildRefill({ id: 'refill_claimed', state: 'CLAIMED', claimedBy: 'anna' });
    const purchased = buildRefill({ id: 'refill_purchased', state: 'PURCHASED', claimedBy: 'anna' });

    expect(pick({ volunteers: [anna, bjorn], activeRefills: [OSLO_REFILL, claimed] })).toBe('bjorn');
    expect(pick({ volunteers: [anna, bjorn], activeRefills: [OSLO_REFILL, purchased] })).toBe('anna');
  });

  it('skips a volunteer whose HR claim has been pending more than 10 days, but not 9 or exactly 10', () => {
    const pendingSince = (days: number): Purchase[] => [
      refillBy('anna', daysAgo(days), { hrStatus: 'PENDING', hrSubmittedAt: daysAgo(days) }),
    ];
    // bjorn also has one refill, but a more recent one, so anna wins whenever she is eligible.
    const bjornRefill = refillBy('bjorn', daysAgo(1));
    const volunteers = [anna, bjorn];

    expect(pick({ volunteers, purchases: [...pendingSince(9), bjornRefill] })).toBe('anna');
    expect(pick({ volunteers, purchases: [...pendingSince(10), bjornRefill] })).toBe('anna');
    expect(pick({ volunteers, purchases: [...pendingSince(11), bjornRefill] })).toBe('bjorn');
  });

  it('does not skip a volunteer whose old claim was approved or rejected', () => {
    const purchases = [
      refillBy('anna', daysAgo(30), { hrStatus: 'APPROVED', hrSubmittedAt: daysAgo(30) }),
      refillBy('anna', daysAgo(40), { hrStatus: 'REJECTED', hrSubmittedAt: daysAgo(40) }),
    ];

    expect(pick({ volunteers: [anna], purchases })).toBe('anna');
  });

  it('counts a visitor for the office they are in, not their home office', () => {
    const visitorInOslo = buildVolunteer({
      employeeId: 'priya',
      homeOffice: 'BENGALURU',
      payrollCurrency: 'INR',
      currentOffice: 'OSLO',
    });
    const bengaluruRefill = buildRefill({ id: 'refill_blr', office: 'BENGALURU' });

    expect(pick({ volunteers: [visitorInOslo] })).toBe('priya');
    expect(pick({ refill: bengaluruRefill, activeRefills: [bengaluruRefill], volunteers: [visitorInOslo] })).toBeNull();
  });

  it('returns null when nobody is eligible', () => {
    expect(pick({ volunteers: [] })).toBeNull();
  });
});

describe('pickNext: purity', () => {
  it('does not change its input', () => {
    const volunteers: Volunteer[] = [carl, anna, bjorn];
    const purchases = [refillBy('anna', daysAgo(3))];
    const activeRefills: Refill[] = [OSLO_REFILL];
    const before = structuredClone({ volunteers, purchases, activeRefills });

    pick({ volunteers, purchases, activeRefills });

    expect({ volunteers, purchases, activeRefills }).toEqual(before);
  });
});
