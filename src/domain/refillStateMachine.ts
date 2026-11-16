import { InvalidTransitionError } from '../errors';
import { RefillState } from './types';

// Allowed moves from each state. Creation (none -> REPORTED_EMPTY)
// is not a transition between states, so it is not in this table.
const ALLOWED_TRANSITIONS: Record<RefillState, readonly RefillState[]> = {
  REPORTED_EMPTY: ['OPEN', 'CANCELLED'],
  OPEN: ['OPEN', 'CLAIMED', 'CANCELLED'], // OPEN -> OPEN: offer moves to the next person
  CLAIMED: ['PURCHASED', 'EXPIRED', 'CANCELLED'],
  EXPIRED: ['OPEN'],
  PURCHASED: ['CLAIM_SUBMITTED'],
  CLAIM_SUBMITTED: ['REIMBURSED', 'REJECTED'],
  REIMBURSED: [],
  REJECTED: [],
  CANCELLED: [],
};

const TERMINAL_STATES: readonly RefillState[] = ['REIMBURSED', 'REJECTED', 'CANCELLED'];

export function canTransition(from: RefillState, to: RefillState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RefillState, to: RefillState): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(`Refill cannot move from ${from} to ${to}`);
  }
}

// A terminal refill is finished; any other state blocks a new refill for the
// same office
export function isTerminal(state: RefillState): boolean {
  return TERMINAL_STATES.includes(state);
}
