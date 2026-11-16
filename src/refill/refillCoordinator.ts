import { ChatPort } from '../adapters/chatPort';
import { HrPort } from '../adapters/hrPort';
import { Clock } from '../clock';
import { AppConfig } from '../config';
import { isBoxEmpty, isTerminal } from '../domain/refillStateMachine';
import { Office, Purchase, PurchaseInput, Refill } from '../domain/types';
import {
  AlreadyClaimedError,
  InvalidStateError,
  NotFoundError,
  NotOfferedToYouError,
  NotYourClaimError,
  ValidationError,
  VersionConflictError,
} from '../errors';
import { IdGenerator } from '../ids';
import { assessPurchase, budgetStatus } from '../money/budgetTracker';
import { createMoney } from '../money/money';
import { monthKey } from '../money/monthKey';
import { pickNext } from '../volunteers/assignmentEngine';
import { VolunteerRepository } from '../volunteers/volunteerRepository';
import { HrClaimFollowUp } from './hrClaimFollowUp';
import {
  cancelledMessage,
  claimConfirmedMessage,
  claimExpiredMessage,
  noCandidateManagementMessage,
  noCandidateOfficeMessage,
  offerMessage,
  overBudgetMessage,
} from './messages';
import { PurchaseRepository } from './purchaseRepository';
import { validatePurchaseInput } from './purchaseValidation';
import {
  Notification,
  SYSTEM,
  exclude,
  moveTo,
  saveRefill,
  sendNotifications,
  skipIfChangedMeanwhile,
} from './refillChanges';
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

// Runs the refill lifecycle: report, offer, accept or decline, deadlines,
// hand-over, cancel and purchase. What happens with the HR claim after the
// purchase lives in HrClaimFollowUp. Every change is saved with the version
// it was read at, so two people can never both win.
export class RefillCoordinator {
  private readonly hrFollowUp: HrClaimFollowUp;

  constructor(private readonly deps: RefillCoordinatorDeps) {
    this.hrFollowUp = new HrClaimFollowUp(deps);
  }

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

  async submitPurchase(
    refillId: string,
    volunteerId: string,
    input: PurchaseInput,
  ): Promise<{ refill: Refill; purchase: Purchase }> {
    const refill = await this.getRefill(refillId);
    const now = this.now();

    // A receipt that arrives after the claim deadline is still accepted while
    // the claim has not been handed on: the buyer has already spent the money.
    if (refill.state !== 'CLAIMED') {
      throw new InvalidStateError(`Refill ${refillId} is ${refill.state}; only a claimed refill can be purchased`);
    }
    if (refill.claimedBy !== volunteerId) {
      throw new NotYourClaimError(`Refill ${refillId} is not claimed by ${volunteerId}`);
    }
    const officeConfig = this.deps.config.offices[refill.office];
    validatePurchaseInput(input, officeConfig.currency);

    const officePurchases = await this.deps.purchases.list({ office: refill.office });
    const amount = createMoney(input.amountMinor, input.currency);
    const flags = assessPurchase(refill.office, amount, now, officePurchases, this.deps.config);
    const purchase: Purchase = {
      id: this.deps.ids.next('purchase'),
      refillId,
      buyerId: volunteerId,
      office: refill.office,
      amount,
      items: structuredClone(input.items),
      receiptRef: input.receiptRef,
      purchasedAt: now,
      overBudget: flags.overBudget,
      unusualAmount: flags.unusualAmount,
      hrClaimId: null,
      hrStatus: 'NOT_SUBMITTED',
      hrSubmittedAt: null,
      hrSubmitAttempts: 0,
      hrReminderSentAt: null,
    };

    refill.purchaseId = purchase.id;
    refill.claimDeadline = null;
    moveTo(refill, 'PURCHASED', 'PURCHASED', volunteerId, now);

    // Refill first: if someone changed it meanwhile (cancelled, or a tick
    // handed the claim on), the save is refused and nothing is stored.
    let purchasedRefill: Refill;
    try {
      purchasedRefill = await this.save(refill);
    } catch (error) {
      if (error instanceof VersionConflictError) {
        throw new InvalidStateError(`Refill ${refillId} changed while the purchase was being submitted`);
      }
      throw error;
    }
    await this.deps.purchases.add(purchase);

    // The budget is a soft limit: the purchase stands, management is told.
    if (flags.overBudget) {
      const month = monthKey(now, officeConfig.timeZone);
      const status = budgetStatus(refill.office, month, [...officePurchases, purchase], this.deps.config);
      await this.send([{ kind: 'management', text: overBudgetMessage(purchase, status) }]);
    }

    // If HR is down the purchase is already safe; the claim is retried later.
    return this.hrFollowUp.submit(purchasedRefill, purchase, now);
  }

  // Safe to call any number of times: it only acts on deadlines that have
  // passed, refills still waiting for someone, and HR work still to do.
  async tick(): Promise<void> {
    const now = this.now();
    await this.handOnExpiredOffers(now);
    await this.reopenOverdueClaims(now);
    await this.retryRefillsWithoutOffer(now);
    await this.hrFollowUp.retryPendingSubmissions(now);
    await this.hrFollowUp.sendReminders(now);
  }

  async syncHrClaims(): Promise<void> {
    const now = this.now();
    await this.hrFollowUp.retryPendingSubmissions(now);
    await this.hrFollowUp.applyHrDecisions(now);
    await this.hrFollowUp.sendReminders(now);
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

  private async save(refill: Refill): Promise<Refill> {
    return saveRefill(this.deps.refills, refill);
  }

  private async send(notifications: readonly Notification[]): Promise<void> {
    await sendNotifications(this.deps.chat, notifications);
  }

  private now(): Date {
    return this.deps.clock.now();
  }
}
