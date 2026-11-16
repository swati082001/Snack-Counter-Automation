import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { DomainError, ErrorCode } from '../errors';

// The only place that knows HTTP statuses. Domain code throws errors with a
// stable code; this maps the code to a status and the shared JSON shape:
// { "error": { "code": "ALREADY_CLAIMED", "message": "..." } }

export const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
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
};

export interface ErrorBody {
  error: { code: string; message: string };
}

export function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}

export function handleError(error: FastifyError, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  if (error instanceof DomainError) {
    return reply.status(HTTP_STATUS_BY_CODE[error.code]).send(errorBody(error.code, error.message));
  }
  // Request did not match the route's JSON schema.
  if (error.validation) {
    return reply.status(400).send(errorBody('VALIDATION', error.message));
  }
  // Other client errors raised by Fastify itself, for example malformed JSON.
  if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
    return reply.status(error.statusCode).send(errorBody('BAD_REQUEST', error.message));
  }
  request.log.error(error);
  return reply.status(500).send(errorBody('INTERNAL', 'Something went wrong'));
}

export function handleNotFound(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply.status(404).send(errorBody('NOT_FOUND', `Route ${request.method} ${request.url} not found`));
}
