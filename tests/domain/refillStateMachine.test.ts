import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, isTerminal } from '../../src/domain/refillStateMachine';
import { RefillState } from '../../src/domain/types';
import { InvalidTransitionError } from '../../src/errors';

const ALL_STATES: RefillState[] = [
  'REPORTED_EMPTY',
  'OPEN',
  'CLAIMED',
  'EXPIRED',
  'PURCHASED',
  'CLAIM_SUBMITTED',
  'REIMBURSED',
  'REJECTED',
  'CANCELLED',
];

// Every allowed transition, written out independently of the source table.
const LISTED: Array<[RefillState, RefillState]> = [
  ['REPORTED_EMPTY', 'OPEN'],
  ['OPEN', 'OPEN'],
  ['OPEN', 'CLAIMED'],
  ['CLAIMED', 'PURCHASED'],
  ['CLAIMED', 'EXPIRED'],
  ['EXPIRED', 'OPEN'],
  ['PURCHASED', 'CLAIM_SUBMITTED'],
  ['CLAIM_SUBMITTED', 'REIMBURSED'],
  ['CLAIM_SUBMITTED', 'REJECTED'],
  ['REPORTED_EMPTY', 'CANCELLED'],
  ['OPEN', 'CANCELLED'],
  ['CLAIMED', 'CANCELLED'],
];

const isListed = (from: RefillState, to: RefillState): boolean =>
  LISTED.some(([listedFrom, listedTo]) => listedFrom === from && listedTo === to);

const UNLISTED = ALL_STATES.flatMap((from) =>
  ALL_STATES.filter((to) => !isListed(from, to)).map((to): [RefillState, RefillState] => [from, to]),
);

describe('refill state machine', () => {
  it.each(LISTED)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each(UNLISTED)('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
  });

  it('rejects moving a finished or purchased refill backwards with code INVALID_TRANSITION', () => {
    for (const [from, to] of [
      ['REIMBURSED', 'OPEN'],
      ['PURCHASED', 'CLAIMED'],
    ] as const) {
      expect(() => assertTransition(from, to)).toThrow(
        expect.objectContaining({ code: 'INVALID_TRANSITION' }),
      );
    }
  });

  it('treats only REIMBURSED, REJECTED and CANCELLED as terminal', () => {
    const terminal = ALL_STATES.filter(isTerminal);
    expect(terminal).toEqual(['REIMBURSED', 'REJECTED', 'CANCELLED']);
  });
});
