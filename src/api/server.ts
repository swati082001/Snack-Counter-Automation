import Fastify, { FastifyInstance } from 'fastify';

export interface BuildAppOptions {
  // Off by default so tests stay quiet; the composition root turns it on.
  logger?: boolean;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get('/health', async () => ({ ok: true }));

  return app;
}

// Composition root: only runs when started directly (pnpm dev / pnpm start),
// never when imported by tests.
if (require.main === module) {
  const app = buildApp({ logger: true });
  const port = Number(process.env.PORT ?? 3000);
  app.listen({ port, host: '0.0.0.0' }).catch((err: unknown) => {
    app.log.error(err);
    process.exit(1);
  });
}
