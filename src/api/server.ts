import Fastify, { FastifyInstance } from 'fastify';
import { FakeChat } from '../adapters/fakeChat';
import { FakeHr } from '../adapters/fakeHr';
import { OffsetClock, SystemClock } from '../clock';
import { DEFAULT_CONFIG } from '../config';
import { SequentialIdGenerator, UuidIdGenerator } from '../ids';
import { InMemoryPurchaseRepository } from '../refill/purchaseRepository';
import { RefillCoordinator } from '../refill/refillCoordinator';
import { InMemoryRefillRepository } from '../refill/refillRepository';
import { InMemoryVolunteerRepository } from '../volunteers/volunteerRepository';
import { AppDeps } from './appDeps';
import { DEMO_ROSTER } from './demoRoster';
import { handleError, handleNotFound } from './errorMapper';
import { registerAdminRoutes } from './routes/admin';
import { registerDevRoutes } from './routes/dev';
import { registerRefillRoutes } from './routes/refills';
import { registerReportRoutes } from './routes/reports';
import { registerVolunteerRoutes } from './routes/volunteers';

export interface BuildAppOptions {
  // Off by default so tests stay quiet; the composition root turns it on.
  logger?: boolean;
}

export function buildApp(
  deps: AppDeps = createInMemoryDeps({ devMode: false }),
  options: BuildAppOptions = {},
): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.setErrorHandler(handleError);
  app.setNotFoundHandler(handleNotFound);

  app.get('/health', async () => ({ ok: true }));
  registerRefillRoutes(app, deps);
  registerVolunteerRoutes(app, deps);
  registerReportRoutes(app, deps);
  registerAdminRoutes(app, deps);
  if (deps.dev) {
    registerDevRoutes(app, deps.dev);
  }

  return app;
}

// Composition root: the only place that picks concrete implementations.
// Dev mode uses a clock the demo can move forward, readable sequential ids,
// and exposes the fake chat and HR through the /dev routes.
export function createInMemoryDeps({ devMode }: { devMode: boolean }): AppDeps {
  const devClock = devMode ? new OffsetClock() : null;
  const clock = devClock ?? new SystemClock();
  const ids = devMode ? new SequentialIdGenerator() : new UuidIdGenerator();
  const config = DEFAULT_CONFIG;
  const refills = new InMemoryRefillRepository();
  const volunteers = new InMemoryVolunteerRepository();
  const purchases = new InMemoryPurchaseRepository();
  const chat = new FakeChat(clock);
  const hr = new FakeHr();
  const coordinator = new RefillCoordinator({ refills, volunteers, purchases, chat, hr, clock, ids, config });

  const deps: AppDeps = { coordinator, refills, volunteers, purchases, config };
  if (devClock) {
    deps.dev = { chat, hr, clock: devClock };
  }
  return deps;
}

const SCHEDULER_INTERVAL_MS = 60 * 1000;

async function start(): Promise<void> {
  const devMode = process.argv.includes('--dev');
  const deps = createInMemoryDeps({ devMode });
  for (const volunteer of DEMO_ROSTER) {
    await deps.volunteers.upsert(volunteer);
  }

  const app = buildApp(deps, { logger: true });

  // In production a job scheduler would do this. Here: every minute, hand
  // on expired offers and claims, retry HR, and pick up HR decisions.
  const runScheduledJobs = async (): Promise<void> => {
    try {
      await deps.coordinator.tick();
      await deps.coordinator.syncHrClaims();
    } catch (error) {
      app.log.error(error);
    }
  };
  const scheduler = setInterval(() => void runScheduledJobs(), SCHEDULER_INTERVAL_MS);
  app.addHook('onClose', async () => clearInterval(scheduler));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(devMode ? 'Dev mode: /dev routes enabled' : 'Production mode');
}

// Only runs when started directly (pnpm dev / pnpm start), never when imported by tests.
if (require.main === module) {
  start().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
