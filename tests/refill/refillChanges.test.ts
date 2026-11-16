import { describe, expect, it } from 'vitest';
import { InvalidTransitionError, ValidationError, VersionConflictError } from '../../src/errors';
import { exclude, moveTo, skipIfChangedMeanwhile } from '../../src/refill/refillChanges';
import { buildRefill } from '../support/builders';

const AT = new Date('2026-11-16T09:00:00.000Z');

describe('refill change helpers', () => {
  it('moveTo changes the state and records the step in history', () => {
    const refill = buildRefill({ state: 'OPEN' });

    moveTo(refill, 'CLAIMED', 'OFFER_ACCEPTED', 'anna', AT);

    expect(refill.state).toBe('CLAIMED');
    expect(refill.history).toEqual([{ at: AT, from: 'OPEN', to: 'CLAIMED', event: 'OFFER_ACCEPTED', actor: 'anna' }]);
  });

  it('moveTo refuses a move the state machine does not allow, leaving the refill untouched', () => {
    const refill = buildRefill({ state: 'OPEN' });

    expect(() => moveTo(refill, 'REIMBURSED', 'HR_APPROVED', 'hr', AT)).toThrow(InvalidTransitionError);
    expect(refill.state).toBe('OPEN');
    expect(refill.history).toEqual([]);
  });

  it('exclude adds a volunteer once', () => {
    const refill = buildRefill();

    exclude(refill, 'anna');
    exclude(refill, 'anna');

    expect(refill.excludedVolunteerIds).toEqual(['anna']);
  });

  it('skipIfChangedMeanwhile swallows only version conflicts', async () => {
    await expect(
      skipIfChangedMeanwhile(async () => {
        throw new VersionConflictError('someone else saved first');
      }),
    ).resolves.toBeUndefined();

    await expect(
      skipIfChangedMeanwhile(async () => {
        throw new ValidationError('a real problem');
      }),
    ).rejects.toThrow(ValidationError);
  });
});
