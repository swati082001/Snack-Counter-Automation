import { ChatPort } from '../adapters/chatPort';
import { HrPort } from '../adapters/hrPort';
import { Clock } from '../clock';
import { AppConfig } from '../config';
import { assertTransition, isBoxEmpty, isTerminal } from '../domain/refillStateMachine';
import { Office, Refill, RefillState } from '../domain/types';
import {
  AlreadyClaimedError,
  InvalidStateError,
  NotFoundError,
  NotOfferedToYouError,
  ValidationError,
  VersionConflictError,
} from '../errors';
import { IdGenerator } from '../ids';
import { budgetStatus } from '../money/budgetTracker';
import { monthKey } from '../money/monthKey';
import { pickNext } from '../volunteers/assignmentEngine';
import { VolunteerRepository } from '../volunteers/volunteerRepository';
import {
  cancelledMessage,
  claimConfirmedMessage,
  claimExpiredMessage,
  noCandidateManagementMessage,
  noCandidateOfficeMessage,
  offerMessage,
} from './messages';
import { PurchaseRepository } from './purchaseRepository';
import { RefillRepository } from './refillRepository';

export interface RefillCoordinatorDeps {
  refills: RefillRepository;
  volunteers: VolunteerRepository;
  purchases: PurchaseRepository;
  chat: ChatPort;
  hr: HrPort;
  clock: Clock;
  ids: IdGenerator;
  config: AppConfig;
}

// Messages are collected while a refill is changed and sent only after the
// save succeeds, so nobody is told about a change that was then refused.
type Notification =
  | { kind: 'direct'; to: string; text: string }
  | { kind: 'office'; office: Office; text: string }
  | { kind: 'management'; text: string };

const SYSTEM = 'system';

// Runs the refill lifecycle: report, offer, accept or decline, deadlines,
// hand-over and cancel. Every change goes through the state machine and is
// saved with the version it was read at, so two people can never both win.
export class RefillCoordinator {
  constructor(private readonly deps: RefillCoordinatorDeps) {}

  async reportEmpty(office: Office, reportedBy: string): Promise<Refill> {
    const existing = await this.deps.refills.findActiveByOffice(office);
    if (existing) {
      return existing;
    }

    const now = this.now();
    const refill: Refill = {
      id: this.deps.ids.next('refill'),
      office,
      state: 'REPORTED_EMPTY',
      version: 1,
      reportedBy,
      createdAt: now,
      currentOffer: null,
      excludedVolunteerIds: [],
      claimedBy: null,
      claimDeadline: null,
      purchaseId: null,
      history: [{ at: now, from: null, to: 'REPORTED_EMPTY', event: 'REPORTED', actor: reportedBy }],
    };
    moveTo(refill, 'OPEN', 'OPENED', SYSTEM, now);
    const notifications = await this.offerToNextCandidate(refill, now);

    try {
      await this.deps.refills.create(refill);
    } catch (error) {
      if (!(error instanceof VersionConflictError)) {
        throw error;
      }
      // Another report for the same office was saved first: join that refill.
      const winner = await this.deps.refills.findActiveByOffice(office);
      if (!winner) {
        throw error;
      }
      return winner;
    }

    await this.send(notifications);
    return refill;
  }

  async acceptOffer(refillId: string, volunteerId: string): Promise<Refill> {
    const refill = await this.getRefill(refillId);
    const now = this.now();

    if (refill.state === 'CLAIMED') {
      throw new AlreadyClaimedError(`Refill ${refillId} is already claimed`);
    }
    if (refill.state !== 'OPEN') {
      throw new InvalidStateError(`Refill ${refillId} is ${refill.state}, not open for offers`);
    }
    const offer = refill.currentOffer;
    if (!offer || offer.volunteerId !== volunteerId) {
      throw new NotOfferedToYouError(`Refill ${refillId} is not offered to ${volunteerId}`);
    }
    // A late answer no longer counts: the next tick hands the offer on.
    if (now >= offer.expiresAt) {
      throw new NotOfferedToYouError(`The offer of refill ${refillId} to ${volunteerId} has expired`);
    }

    const deadline = new Date(now.getTime() + this.deps.config.purchaseDeadlineMs);
    refill.currentOffer = null;
    refill.claimedBy = volunteerId;
    refill.claimDeadline = deadline;
    moveTo(refill, 'CLAIMED', 'OFFER_ACCEPTED', volunteerId, now);

    let saved: Refill;
    try {
      saved = await this.save(refill);
    } catch (error) {
      if (error instanceof VersionConflictError) {
        throw new AlreadyClaimedError(`Refill ${refillId} was claimed or changed by someone else`);
      }
      throw error;
    }

    const { timeZone } = this.deps.config.offices[refill.office];
    await this.send([{ kind: 'direct', to: volunteerId, text: claimConfirmedMessage(refill, deadline, timeZone) }]);
    return saved;
  }

  async declineOffer(refillId: string, volunteerId: string): Promise<Refill> {
    const refill = await this.getRefill(refillId);
    const now = this.now();

    if (refill.state !== 'OPEN') {
      throw new InvalidStateError(`Refill ${refillId} is ${refill.state}, not open for offers`);
    }
    if (refill.currentOffer?.volunteerId !== volunteerId) {
      throw new NotOfferedToYouError(`Refill ${refillId} is not offered to ${volunteerId}`);
    }

    exclude(refill, volunteerId);
    refill.currentOffer = null;
    moveTo(refill, 'OPEN', 'OFFER_DECLINED', volunteerId, now);
    const notifications = await this.offerToNextCandidate(refill, now);

    const saved = await this.save(refill);
    await this.send(notifications);
    return saved;
  }

  async cancelRefill(refillId: string, byEmployeeId: string, reason: string): Promise<Refill> {
    if (reason.trim() === '') {
      throw new ValidationError('A reason is required to cancel a refill');
    }
    const refill = await this.getRefill(refillId);
    const now = this.now();

    // Once purchased, money has been spent and the HR claim must go ahead.
    if (!isBoxEmpty(refill.state)) {
      throw new InvalidStateError(`Refill ${refillId} is ${refill.state} and can no longer be cancelled`);
    }

    const affected = refill.currentOffer?.volunteerId ?? refill.claimedBy;
    refill.currentOffer = null;
    refill.claimedBy = null;
    refill.claimDeadline = null;
    moveTo(refill, 'CANCELLED', 'CANCELLED', byEmployeeId, now);

    const saved = await this.save(refill);
    if (affected && affected !== byEmployeeId) {
      await this.send([{ kind: 'direct', to: affected, text: cancelledMessage(refill, reason.trim()) }]);
    }
    return saved;
  }

  // Safe to call any number of times: it only acts on deadlines that have
  // passed and refills still waiting for someone.
  async tick(): Promise<void> {
    const now = this.now();
    await this.handOnExpiredOffers(now);
    await this.reopenOverdueClaims(now);
    await this.retryRefillsWithoutOffer(now);
  }

  async getRefill(id: string): Promise<Refill> {
    const refill = await this.deps.refills.get(id);
    if (!refill) {
      throw new NotFoundError(`Refill ${id} not found`);
    }
    return refill;
  }

  private async handOnExpiredOffers(now: Date): Promise<void> {
    for (const refill of await this.deps.refills.list({ state: 'OPEN' })) {
      const offer = refill.currentOffer;
      if (!offer || now < offer.expiresAt) {
        continue;
      }
      await skipIfChangedMeanwhile(async () => {
        exclude(refill, offer.volunteerId);
        refill.currentOffer = null;
        moveTo(refill, 'OPEN', 'OFFER_EXPIRED', SYSTEM, now);
        const notifications = await this.offerToNextCandidate(refill, now);
        await this.save(refill);
        await this.send(notifications);
      });
    }
  }

  // CLAIMED -> EXPIRED -> OPEN in one save: EXPIRED is never a resting state,
  // but both steps stay visible in the history.
  private async reopenOverdueClaims(now: Date): Promise<void> {
    for (const refill of await this.deps.refills.list({ state: 'CLAIMED' })) {
      const claimer = refill.claimedBy;
      if (!claimer || !refill.claimDeadline || now < refill.claimDeadline) {
        continue;
      }
      await skipIfChangedMeanwhile(async () => {
        moveTo(refill, 'EXPIRED', 'CLAIM_EXPIRED', SYSTEM, now);
        exclude(refill, claimer);
        refill.claimedBy = null;
        refill.claimDeadline = null;
        moveTo(refill, 'OPEN', 'REOPENED', SYSTEM, now);
        const notifications = await this.offerToNextCandidate(refill, now);
        await this.save(refill);
        await this.send([{ kind: 'direct', to: claimer, text: claimExpiredMessage(refill) }, ...notifications]);
      });
    }
  }

  private async retryRefillsWithoutOffer(now: Date): Promise<void> {
    for (const refill of await this.deps.refills.list({ state: 'OPEN' })) {
      if (refill.currentOffer) {
        continue;
      }
      await skipIfChangedMeanwhile(async () => {
        const historyLengthBefore = refill.history.length;
        const notifications = await this.offerToNextCandidate(refill, now);
        // Nothing new happened (still nobody, already announced): no save, so
        // repeated ticks leave the refill untouched.
        if (refill.history.length === historyLengthBefore) {
          return;
        }
        await this.save(refill);
        await this.send(notifications);
      });
    }
  }

  // Changes the refill in memory (offer, exclusions, history) and returns the
  // messages to send once it is saved. The refill must be OPEN with no offer.
  private async offerToNextCandidate(refill: Refill, now: Date): Promise<Notification[]> {
    const [volunteers, purchases, allRefills] = await Promise.all([
      this.deps.volunteers.list(),
      this.deps.purchases.list(),
      this.deps.refills.list(),
    ]);
    const otherActiveRefills = allRefills.filter((other) => other.id !== refill.id && !isTerminal(other.state));
    const pickFor = (target: Refill) =>
      pickNext({
        refill: target,
        volunteers,
        purchases,
        activeRefills: [target, ...otherActiveRefills],
        now,
        config: this.deps.config,
      });

    let candidate = pickFor(refill);

    // Everyone who could buy has declined or timed out. After a while, ask
    // them again rather than leaving the box empty forever.
    if (!candidate && this.mayClearExclusions(refill, now)) {
      candidate = pickFor({ ...refill, excludedVolunteerIds: [] });
      if (candidate) {
        refill.excludedVolunteerIds = [];
        moveTo(refill, 'OPEN', 'EXCLUSIONS_CLEARED', SYSTEM, now);
      }
    }

    const { timeZone } = this.deps.config.offices[refill.office];

    if (candidate) {
      const offer = {
        volunteerId: candidate.employeeId,
        offeredAt: now,
        expiresAt: new Date(now.getTime() + this.deps.config.offerWindowMs),
      };
      refill.currentOffer = offer;
      moveTo(refill, 'OPEN', 'OFFERED', SYSTEM, now);
      const budget = budgetStatus(refill.office, monthKey(now, timeZone), purchases, this.deps.config);
      return [{ kind: 'direct', to: offer.volunteerId, text: offerMessage(refill, offer, budget.remaining, timeZone) }];
    }

    // Nobody can be asked. Tell the office and management once per refill;
    // the history entry is the record that this was already done.
    if (refill.history.some((entry) => entry.event === 'NO_CANDIDATE')) {
      return [];
    }
    moveTo(refill, 'OPEN', 'NO_CANDIDATE', SYSTEM, now);
    return [
      { kind: 'office', office: refill.office, text: noCandidateOfficeMessage(refill) },
      { kind: 'management', text: noCandidateManagementMessage(refill) },
    ];
  }

  private mayClearExclusions(refill: Refill, now: Date): boolean {
    const openForMs = now.getTime() - refill.createdAt.getTime();
    return refill.excludedVolunteerIds.length > 0 && openForMs > this.deps.config.clearExclusionsAfterMs;
  }

  // Saves with the version that was read; the repository refuses the save if
  // anyone else saved first. Returns the refill with its new version.
  private async save(refill: Refill): Promise<Refill> {
    await this.deps.refills.save(refill, refill.version);
    return { ...refill, version: refill.version + 1 };
  }

  private async send(notifications: readonly Notification[]): Promise<void> {
    for (const notification of notifications) {
      switch (notification.kind) {
        case 'direct':
          await this.deps.chat.sendDirect(notification.to, notification.text);
          break;
        case 'office':
          await this.deps.chat.postToOffice(notification.office, notification.text);
          break;
        case 'management':
          await this.deps.chat.notifyManagement(notification.text);
          break;
      }
    }
  }

  private now(): Date {
    return this.deps.clock.now();
  }
}

function moveTo(refill: Refill, to: RefillState, event: string, actor: string, at: Date): void {
  assertTransition(refill.state, to);
  refill.history.push({ at, from: refill.state, to, event, actor });
  refill.state = to;
}

function exclude(refill: Refill, volunteerId: string): void {
  if (!refill.excludedVolunteerIds.includes(volunteerId)) {
    refill.excludedVolunteerIds.push(volunteerId);
  }
}

// During tick, someone may change a refill at the same moment (for example
// accept an offer). That save wins; this tick skips the refill and the next
// tick looks at it again with fresh data.
async function skipIfChangedMeanwhile(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (!(error instanceof VersionConflictError)) {
      throw error;
    }
  }
}
