import { FastifyInstance } from 'fastify';
import { AppDeps } from '../appDeps';

// Run the background jobs now instead of waiting for the next minute.
export function registerAdminRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.post('/admin/tick', async () => {
    await deps.coordinator.tick();
    return { ok: true };
  });

  app.post('/admin/sync-hr', async () => {
    await deps.coordinator.syncHrClaims();
    return { ok: true };
  });
}
