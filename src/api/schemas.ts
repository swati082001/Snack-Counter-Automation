// JSON Schema pieces shared by the routes. Fastify validates every request
// against them before the handler runs; a mismatch becomes a 400.

export const officeSchema = { type: 'string', enum: ['OSLO', 'BENGALURU'] } as const;
export const currencySchema = { type: 'string', enum: ['NOK', 'INR'] } as const;
export const availabilitySchema = { type: 'string', enum: ['OFFICE', 'REMOTE', 'AWAY'] } as const;
export const idSchema = { type: 'string', minLength: 1 } as const;
export const refillStateSchema = {
  type: 'string',
  enum: [
    'REPORTED_EMPTY',
    'OPEN',
    'CLAIMED',
    'EXPIRED',
    'PURCHASED',
    'CLAIM_SUBMITTED',
    'REIMBURSED',
    'REJECTED',
    'CANCELLED',
  ],
} as const;

export const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: idSchema },
} as const;

export function bodySchema(properties: Record<string, object>, required: string[]): object {
  return { type: 'object', required, properties, additionalProperties: false };
}
