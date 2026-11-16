import { describe, expect, it } from 'vitest';
import { HTTP_STATUS_BY_CODE } from '../../src/api/errorMapper';

describe('HTTP_STATUS_BY_CODE', () => {
  it('maps every domain error code to its documented HTTP status', () => {
    expect(HTTP_STATUS_BY_CODE).toEqual({
      VALIDATION: 400,
      NOT_FOUND: 404,
      NOT_OFFERED_TO_YOU: 403,
      NOT_YOUR_CLAIM: 403,
      ALREADY_CLAIMED: 409,
      INVALID_STATE: 409,
      INVALID_TRANSITION: 409,
      VERSION_CONFLICT: 409,
      CURRENCY_MISMATCH: 422,
      HR_UNAVAILABLE: 502,
    });
  });
});
