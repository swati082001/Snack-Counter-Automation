// Domain errors. Each has a stable `code`; the API layer maps codes
// to HTTP statuses, so domain code never needs to know about HTTP.

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'NOT_OFFERED_TO_YOU'
  | 'NOT_YOUR_CLAIM'
  | 'ALREADY_CLAIMED'
  | 'INVALID_STATE'
  | 'INVALID_TRANSITION'
  | 'VERSION_CONFLICT'
  | 'CURRENCY_MISMATCH'
  | 'HR_UNAVAILABLE';

export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;

  constructor(message: string) {
    super(message);
    // Shows the subclass name (e.g. 'AlreadyClaimedError') in stack traces.
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION';
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
}

export class NotOfferedToYouError extends DomainError {
  readonly code = 'NOT_OFFERED_TO_YOU';
}

export class NotYourClaimError extends DomainError {
  readonly code = 'NOT_YOUR_CLAIM';
}

export class AlreadyClaimedError extends DomainError {
  readonly code = 'ALREADY_CLAIMED';
}

export class InvalidStateError extends DomainError {
  readonly code = 'INVALID_STATE';
}

export class InvalidTransitionError extends DomainError {
  readonly code = 'INVALID_TRANSITION';
}

// Internal: the coordinator turns this into AlreadyClaimedError inside accept.
export class VersionConflictError extends DomainError {
  readonly code = 'VERSION_CONFLICT';
}

export class CurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';
}

export class HrUnavailableError extends DomainError {
  readonly code = 'HR_UNAVAILABLE';
}
