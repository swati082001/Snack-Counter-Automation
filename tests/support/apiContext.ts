import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/server';
import { TestContext, buildTestContext } from './testContext';

export interface ApiContext extends TestContext {
  app: FastifyInstance;
}

// The real Fastify app over the in-memory test context (fake clock, fake chat,
// fake HR). Requests go through app.inject(), so no network port is opened.
export async function buildApiContext({ devRoutes = true } = {}): Promise<ApiContext> {
  const ctx = await buildTestContext();
  const app = buildApp({
    coordinator: ctx.coordinator,
    refills: ctx.refills,
    volunteers: ctx.volunteers,
    purchases: ctx.purchases,
    config: ctx.config,
    dev: devRoutes ? { chat: ctx.chat, hr: ctx.hr, clock: ctx.clock } : undefined,
  });
  return { ...ctx, app };
}
