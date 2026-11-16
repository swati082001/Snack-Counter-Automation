import { ChatPort } from '../adapters/chatPort';
import { HrGateway } from '../adapters/hrGateway';
import { HrClaimStatus, HrPort } from '../adapters/hrPort';
import { AppConfig, DAY_MS } from '../config';
import { Purchase, Refill } from '../domain/types';
import { HrUnavailableError, NotFoundError, VersionConflictError } from '../errors';
import {
  hrReminderMessage,
  hrSubmitFailedMessage,
  reimbursedMessage,
  rejectedBuyerMessage,
  rejectedManagementMessage,
} from './messages';
import { PurchaseRepository } from './purchaseRepository';
import { HR, Notification, SYSTEM, moveTo, saveRefill, sendNotifications, skipIfChangedMeanwhile } from './refillChanges';
import { RefillRepository } from './refillRepository';

export interface HrClaimFollowUpDeps {
  refills: RefillRepository;
  purchases: PurchaseRepository;
  chat: ChatPort;
  hr: HrPort;
  config: AppConfig;
}

// Everything that happens after the snacks are bought: sending the HR claim,
// retrying while HR is down, picking up HR's decision, and reminding
// management about slow claims. HR is treated as eventually consistent:
// idempotent submits, retries, and polling instead of callbacks.
export class HrClaimFollowUp {
  private readonly gateway: HrGateway;

  constructor(private readonly deps: HrClaimFollowUpDeps) {
    this.gateway = new HrGateway(deps.hr, deps.config.hrMaxSubmitAttempts);
  }

  // Sends the claim (with retries inside the gateway). On success the refill
  // moves to CLAIM_SUBMITTED; on failure it stays PURCHASED for a later retry.
  async submit(refill: Refill, purchase: Purchase, now: Date): Promise<{ refill: Refill; purchase: Purchase }> {
    const isFirstTry = purchase.hrSubmitAttempts === 0;
    const result = await this.gateway.submit(purchase);
    const attempts = purchase.hrSubmitAttempts + result.attempts;

    if (!result.ok) {
      const notSubmitted = { ...purchase, hrSubmitAttempts: attempts };
      await this.deps.purchases.update(notSubmitted);
      // Only the first failure is announced; retries run every tick and
      // would otherwise flood management while HR is down.
      if (isFirstTry) {
        await this.send([{ kind: 'management', text: hrSubmitFailedMessage(notSubmitted) }]);
      }
      return { refill, purchase: notSubmitted };
    }

    const submitted: Purchase = {
      ...purchase,
      hrClaimId: result.claimId,
      hrStatus: 'PENDING',
      hrSubmittedAt: now,
      hrSubmitAttempts: attempts,
    };
    await this.deps.purchases.update(submitted);
    moveTo(refill, 'CLAIM_SUBMITTED', 'HR_CLAIM_SUBMITTED', SYSTEM, now);
    try {
      return { refill: await saveRefill(this.deps.refills, refill), purchase: submitted };
    } catch (error) {
      // A tick retried the same claim at the same moment and saved first.
      // The idempotency key made it the same claim, so just return the result.
      if (error instanceof VersionConflictError) {
        return { refill: await this.getRefill(refill.id), purchase: submitted };
      }
      throw error;
    }
  }

  async retryPendingSubmissions(now: Date): Promise<void> {
    for (const refill of await this.deps.refills.list({ state: 'PURCHASED' })) {
      const purchase = refill.purchaseId ? await this.deps.purchases.get(refill.purchaseId) : null;
      if (purchase) {
        await this.submit(refill, purchase, now);
      }
    }
  }

  // HR has no callbacks, so its decisions are fetched by polling.
  async applyHrDecisions(now: Date): Promise<void> {
    for (const purchase of await this.deps.purchases.list({ hrStatus: 'PENDING' })) {
      await this.applyHrDecision(purchase, now);
    }
  }

  // HR normally decides within 10 days. A claim pending longer is flagged to
  // management once; `hrReminderSentAt` records that it was done.
  async sendReminders(now: Date): Promise<void> {
    const { hrReminderAfterDays } = this.deps.config;
    for (const purchase of await this.deps.purchases.list({ hrStatus: 'PENDING' })) {
      if (!purchase.hrSubmittedAt || purchase.hrReminderSentAt) {
        continue;
      }
      const pendingForMs = now.getTime() - purchase.hrSubmittedAt.getTime();
      if (pendingForMs <= hrReminderAfterDays * DAY_MS) {
        continue;
      }
      const reminded = { ...purchase, hrReminderSentAt: now };
      await this.deps.purchases.update(reminded);
      await this.send([{ kind: 'management', text: hrReminderMessage(reminded, hrReminderAfterDays) }]);
    }
  }

  private async applyHrDecision(purchase: Purchase, now: Date): Promise<void> {
    if (!purchase.hrClaimId) {
      return;
    }
    let status: HrClaimStatus;
    try {
      status = await this.gateway.status(purchase.hrClaimId);
    } catch (error) {
      // HR is down: leave it pending and ask again on the next sync.
      if (error instanceof HrUnavailableError) {
        return;
      }
      throw error;
    }
    if (status === 'PENDING') {
      return;
    }

    const refill = await this.getRefill(purchase.refillId);
    const decided: Purchase = { ...purchase, hrStatus: status };
    await skipIfChangedMeanwhile(async () => {
      // Refill first, then purchase: if the refill save is refused, the
      // purchase stays PENDING and the next sync tries again.
      if (status === 'APPROVED') {
        moveTo(refill, 'REIMBURSED', 'HR_APPROVED', HR, now);
        await saveRefill(this.deps.refills, refill);
        await this.deps.purchases.update(decided);
        await this.send([{ kind: 'direct', to: purchase.buyerId, text: reimbursedMessage(decided) }]);
        return;
      }
      // A rejected claim still counts as spend; sorting it out with HR is a human task.
      moveTo(refill, 'REJECTED', 'HR_REJECTED', HR, now);
      await saveRefill(this.deps.refills, refill);
      await this.deps.purchases.update(decided);
      await this.send([
        { kind: 'direct', to: purchase.buyerId, text: rejectedBuyerMessage(decided) },
        { kind: 'management', text: rejectedManagementMessage(decided) },
      ]);
    });
  }

  private async getRefill(id: string): Promise<Refill> {
    const refill = await this.deps.refills.get(id);
    if (!refill) {
      throw new NotFoundError(`Refill ${id} not found`);
    }
    return refill;
  }

  private async send(notifications: readonly Notification[]): Promise<void> {
    await sendNotifications(this.deps.chat, notifications);
  }
}
