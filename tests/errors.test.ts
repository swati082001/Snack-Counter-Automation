import { describe, expect, it } from 'vitest';
import {
  AlreadyClaimedError,
  CurrencyMismatchError,
  DomainError,
  HrUnavailableError,
  InvalidStateError,
  InvalidTransitionError,
  NotFoundError,
  NotOfferedToYouError,
  NotYourClaimError,
  ValidationError,
  VersionConflictError,
} from '../src/errors';

// The API maps these codes to HTTP statuses, so they must never change silently.
const CASES = [
  [ValidationError, 'VALIDATION'],
  [NotFoundError, 'NOT_FOUND'],
  [NotOfferedToYouError, 'NOT_OFFERED_TO_YOU'],
  [NotYourClaimError, 'NOT_YOUR_CLAIM'],
  [AlreadyClaimedError, 'ALREADY_CLAIMED'],
  [InvalidStateError, 'INVALID_STATE'],
  [InvalidTransitionError, 'INVALID_TRANSITION'],
  [VersionConflictError, 'VERSION_CONFLICT'],
  [CurrencyMismatchError, 'CURRENCY_MISMATCH'],
  [HrUnavailableError, 'HR_UNAVAILABLE'],
] as const;

describe('domain errors', () => {
  it.each(CASES)('%o has a stable code, name and message', (ErrorClass, code) => {
    const error = new ErrorClass('something went wrong');

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.name).toBe(ErrorClass.name);
    expect(error.message).toBe('something went wrong');
  });
});
