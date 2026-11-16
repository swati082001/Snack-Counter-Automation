import { ChatPort } from '../adapters/chatPort';
import { assertTransition } from '../domain/refillStateMachine';
import { Office, Refill, RefillState } from '../domain/types';
import { VersionConflictError } from '../errors';
import { RefillRepository } from './refillRepository';

// Small building blocks shared by the coordinator and the HR follow-up, so
// both change, save and announce refills in exactly the same way.

export const SYSTEM = 'system';
export const HR = 'hr';

// Messages are collected while a refill is changed and sent only after the
// save succeeds, so nobody is told about a change that was then refused.
export type Notification =
  | { kind: 'direct'; to: string; text: string }
  | { kind: 'office'; office: Office; text: string }
  | { kind: 'management'; text: string };

// Every state change goes through the state machine and is written to history.
export function moveTo(refill: Refill, to: RefillState, event: string, actor: string, at: Date): void {
  assertTransition(refill.state, to);
  refill.history.push({ at, from: refill.state, to, event, actor });
  refill.state = to;
}

export function exclude(refill: Refill, volunteerId: string): void {
  if (!refill.excludedVolunteerIds.includes(volunteerId)) {
    refill.excludedVolunteerIds.push(volunteerId);
  }
}

// Saves with the version that was read; the repository refuses the save if
// anyone else saved first. Returns the refill with its new version.
export async function saveRefill(refills: RefillRepository, refill: Refill): Promise<Refill> {
  await refills.save(refill, refill.version);
  return { ...refill, version: refill.version + 1 };
}

export async function sendNotifications(chat: ChatPort, notifications: readonly Notification[]): Promise<void> {
  for (const notification of notifications) {
    switch (notification.kind) {
      case 'direct':
        await chat.sendDirect(notification.to, notification.text);
        break;
      case 'office':
        await chat.postToOffice(notification.office, notification.text);
        break;
      case 'management':
        await chat.notifyManagement(notification.text);
        break;
    }
  }
}

// Background work (tick, HR sync) may race with a person changing the same
// refill. That person's save wins; the background job skips the refill and
// looks at it again next time with fresh data.
export async function skipIfChangedMeanwhile(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (!(error instanceof VersionConflictError)) {
      throw error;
    }
  }
}
