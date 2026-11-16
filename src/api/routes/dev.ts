import { FastifyInstance } from 'fastify';
import { DevTools } from '../appDeps';
import { bodySchema } from '../schemas';

const claimParamsSchema = {
  type: 'object',
  required: ['claimId'],
  properties: { claimId: { type: 'string', minLength: 1 } },
} as const;

const MINUTE_MS = 60 * 1000;

// Demo-only controls over the simulated chat, HR system and clock.
// Registered only when the app is built with dev tools (`pnpm dev`).
export function registerDevRoutes(app: FastifyInstance, dev: DevTools): void {
  app.get('/dev/outbox', async () => dev.chat.outbox);

  app.post<{ Params: { claimId: string } }>(
    '/dev/hr/:claimId/approve',
    { schema: { params: claimParamsSchema } },
    async (request) => {
      dev.hr.approve(request.params.claimId);
      return { claimId: request.params.claimId, status: 'APPROVED' };
    },
  );

  app.post<{ Params: { claimId: string } }>(
    '/dev/hr/:claimId/reject',
    { schema: { params: claimParamsSchema } },
    async (request) => {
      dev.hr.reject(request.params.claimId);
      return { claimId: request.params.claimId, status: 'REJECTED' };
    },
  );

  app.post<{ Body: { minutes: number } }>(
    '/dev/clock/advance',
    { schema: { body: bodySchema({ minutes: { type: 'integer', minimum: 1 } }, ['minutes']) } },
    async (request) => {
      dev.clock.advance(request.body.minutes * MINUTE_MS);
      return { now: dev.clock.now() };
    },
  );
}
