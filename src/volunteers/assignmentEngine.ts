import { AppConfig, DAY_MS } from '../config';
import { Purchase, Refill, Volunteer } from '../domain/types';

// Picks who is asked to buy next. Pure: same input, same answer, no I/O.
// The caller passes plain lists and every rule is applied here, so the whole
// "who gets asked" policy can be read in this one file.

export interface PickNextInput {
  refill: Refill;
  volunteers: readonly Volunteer[];
  purchases: readonly Purchase[]; // all purchases, every office
  activeRefills: readonly Refill[]; // all non-terminal refills, every office
  now: Date;
  config: AppConfig;
}

interface Candidate {
  volunteer: Volunteer;
  recentRefillCount: number;
  lastRefillAt: Date | null;
}

export function pickNext(input: PickNextInput): Volunteer | null {
  const purchasesByBuyer = groupByBuyer(input.purchases);
  const busyIds = volunteersHoldingOfferOrClaim(input.activeRefills);
  const purchasesOf = (volunteer: Volunteer) => purchasesByBuyer.get(volunteer.employeeId) ?? [];

  const candidates = input.volunteers
    .filter((volunteer) => isEligible(volunteer, purchasesOf(volunteer), busyIds, input))
    .map((volunteer) => toCandidate(volunteer, purchasesOf(volunteer), input));

  candidates.sort(compareCandidates);
  return candidates[0]?.volunteer ?? null;
}

function isEligible(
  volunteer: Volunteer,
  purchases: readonly Purchase[],
  busyIds: ReadonlySet<string>,
  input: PickNextInput,
): boolean {
  // Buying and restocking is physical, so only people in that office today
  // can be asked. A visitor counts for the office they are visiting.
  const isInTheOffice =
    volunteer.availability === 'OFFICE' && volunteer.currentOffice === input.refill.office;

  return (
    volunteer.optedIn &&
    isInTheOffice &&
    !input.refill.excludedVolunteerIds.includes(volunteer.employeeId) &&
    !busyIds.has(volunteer.employeeId) &&
    !hasLongUnpaidClaim(purchases, input)
  );
}

// One task at a time: someone already asked about, or holding, a refill is
// not asked about another.
function volunteersHoldingOfferOrClaim(activeRefills: readonly Refill[]): Set<string> {
  const busyIds = new Set<string>();
  for (const refill of activeRefills) {
    if (refill.currentOffer) {
      busyIds.add(refill.currentOffer.volunteerId);
    }
    if (refill.state === 'CLAIMED' && refill.claimedBy) {
      busyIds.add(refill.claimedBy);
    }
  }
  return busyIds;
}

// HR normally pays within 10 days. Someone still waiting longer than that is
// already out of pocket, so they are not asked to pay for more.
function hasLongUnpaidClaim(purchases: readonly Purchase[], input: PickNextInput): boolean {
  const skipAfterMs = input.config.unpaidClaimSkipDays * DAY_MS;
  return purchases.some(
    (purchase) =>
      purchase.hrStatus === 'PENDING' &&
      purchase.hrSubmittedAt !== null &&
      input.now.getTime() - purchase.hrSubmittedAt.getTime() > skipAfterMs,
  );
}

function toCandidate(volunteer: Volunteer, purchases: readonly Purchase[], input: PickNextInput): Candidate {
  const windowMs = input.config.fairnessWindowDays * DAY_MS;
  const recentRefillCount = purchases.filter(
    (purchase) => input.now.getTime() - purchase.purchasedAt.getTime() <= windowMs,
  ).length;

  const lastRefillAt = purchases.reduce<Date | null>(
    (latest, purchase) => (latest === null || purchase.purchasedAt > latest ? purchase.purchasedAt : latest),
    null,
  );

  return { volunteer, recentRefillCount, lastRefillAt };
}

// Fairest first: fewest recent refills, then longest since their last refill
// (never refilled comes first), then employeeId so the result is deterministic.
function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.recentRefillCount !== b.recentRefillCount) {
    return a.recentRefillCount - b.recentRefillCount;
  }

  const aLast = a.lastRefillAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const bLast = b.lastRefillAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (aLast !== bLast) {
    return aLast - bLast;
  }

  return compareStrings(a.volunteer.employeeId, b.volunteer.employeeId);
}

// Plain code-point comparison, so the order never depends on the machine's locale.
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function groupByBuyer(purchases: readonly Purchase[]): Map<string, Purchase[]> {
  const byBuyer = new Map<string, Purchase[]>();
  for (const purchase of purchases) {
    const list = byBuyer.get(purchase.buyerId) ?? [];
    list.push(purchase);
    byBuyer.set(purchase.buyerId, list);
  }
  return byBuyer;
}
