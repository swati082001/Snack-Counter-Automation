import { afterEach, describe, expect, it } from 'vitest';
import { HOUR_MS } from '../../../src/config';
import { ApiContext, buildApiContext } from '../../support/apiContext';

describe('admin routes', () => {
  let ctx: ApiContext;

  afterEach(async () => {
    await ctx.app.close();
  });

  it('POST /admin/tick runs the timers now', async () => {
    ctx = await buildApiContext();
    await ctx.app.inject({ method: 'POST', url: '/refills', payload: { office: 'OSLO', reportedBy: 'dina' } });
    ctx.clock.advance(2 * HOUR_MS);

    const response = await ctx.app.inject({ method: 'POST', url: '/admin/tick' });

    expect(response.json()).toEqual({ ok: true });
    expect((await ctx.coordinator.getRefill('refill_1')).currentOffer?.volunteerId).toBe('bjorn');
  });

  it('POST /admin/sync-hr polls HR now', async () => {
    ctx = await buildApiContext();

    const response = await ctx.app.inject({ method: 'POST', url: '/admin/sync-hr' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
