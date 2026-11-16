import { Money, Offer, Purchase, Refill } from '../domain/types';
import { BudgetStatus } from '../money/budgetTracker';
import { formatMoney } from '../money/money';

// Chat message texts in one place, so wording changes never touch the
// refill logic. Times are shown in the office's own time zone.

export function formatLocalTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function offerMessage(refill: Refill, offer: Offer, budgetRemaining: Money, timeZone: string): string {
  return (
    `The ${refill.office} snack box is empty (refill ${refill.id}). You are next in line to restock it. ` +
    `Please accept or decline by ${formatLocalTime(offer.expiresAt, timeZone)}. ` +
    `Budget left this month: ${formatMoney(budgetRemaining)}.`
  );
}

export function claimConfirmedMessage(refill: Refill, deadline: Date, timeZone: string): string {
  return (
    `Thanks! Refill ${refill.id} (${refill.office}) is yours. ` +
    `Please buy snacks and submit the receipt by ${formatLocalTime(deadline, timeZone)}.`
  );
}

export function claimExpiredMessage(refill: Refill): string {
  return (
    `Your claim on refill ${refill.id} (${refill.office}) passed its deadline ` +
    `and has been handed to someone else.`
  );
}

export function noCandidateOfficeMessage(refill: Refill): string {
  return (
    `The ${refill.office} snack box is empty (refill ${refill.id}) and no volunteer in the office is available. ` +
    `If you can restock it, set your status to office.`
  );
}

export function noCandidateManagementMessage(refill: Refill): string {
  return `Refill ${refill.id} (${refill.office}) has no available volunteer and is waiting.`;
}

export function cancelledMessage(refill: Refill, reason: string): string {
  return `Refill ${refill.id} (${refill.office}) was cancelled: ${reason}. No need to buy anything.`;
}

export function overBudgetMessage(purchase: Purchase, status: BudgetStatus): string {
  return (
    `Over budget: ${purchase.office} purchase ${purchase.id} of ${formatMoney(purchase.amount)} ` +
    `brings ${status.month} spend to ${formatMoney(status.spent)} of ${formatMoney(status.budget)}. ` +
    `The purchase was accepted.`
  );
}

export function hrSubmitFailedMessage(purchase: Purchase): string {
  return (
    `Could not send the HR claim for purchase ${purchase.id} (${purchase.office}, ${formatMoney(purchase.amount)}) ` +
    `by ${purchase.buyerId}. HR is unavailable; it will be retried automatically.`
  );
}

export function reimbursedMessage(purchase: Purchase): string {
  return (
    `HR approved your claim for ${formatMoney(purchase.amount)} (refill ${purchase.refillId}). ` +
    `Thanks for restocking!`
  );
}

export function rejectedBuyerMessage(purchase: Purchase): string {
  return (
    `HR rejected your claim for ${formatMoney(purchase.amount)} (refill ${purchase.refillId}). ` +
    `Management has been told and will follow up with you.`
  );
}

export function rejectedManagementMessage(purchase: Purchase): string {
  return (
    `HR rejected claim ${purchase.hrClaimId} by ${purchase.buyerId} for ${formatMoney(purchase.amount)} ` +
    `(${purchase.office}, refill ${purchase.refillId}). Please follow up with HR.`
  );
}

export function hrReminderMessage(purchase: Purchase, days: number): string {
  return (
    `HR claim ${purchase.hrClaimId} by ${purchase.buyerId} for ${formatMoney(purchase.amount)} ` +
    `(${purchase.office}) has been pending for more than ${days} days.`
  );
}
