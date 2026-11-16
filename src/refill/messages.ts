import { Money, Offer, Refill } from '../domain/types';
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
  return `Your claim on refill ${refill.id} (${refill.office}) passed its deadline and has been handed to someone else.`;
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
