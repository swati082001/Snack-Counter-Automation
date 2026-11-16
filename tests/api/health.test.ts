import { afterEach, describe, expect, it } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/server';

describe('GET /health', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with { ok: true }', async () => {
    app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
