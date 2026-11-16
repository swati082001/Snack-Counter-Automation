import { afterEach, describe, expect, it } from 'vitest';
import { ApiContext, buildApiContext } from '../../support/apiContext';

describe('dev routes', () => {
  let ctx: ApiContext;

  afterEach(async () => {
    await ctx.app.close();
  });

  it('GET /dev/outbox shows the messages the fake chat has sent', async () => {
    ctx = await buildApiContext();
    await ctx.app.inject({ method: 'POST', url: '/refills', payload: { office: 'OSLO', reportedBy: 'dina' } });

    const response = await ctx.app.inject({ method: 'GET', url: '/dev/outbox' });

    expect(response.json()).toEqual([
      { kind: 'direct', to: 'anna', text: expect.stringContaining('refill_1'), at: '2026-11-16T09:00:00.000Z' },
    ]);
  });

  it('POST /dev/clock/advance moves the clock forward', async () => {
    ctx = await buildApiContext();

    const response = await ctx.app.inject({ method: 'POST', url: '/dev/clock/advance', payload: { minutes: 90 } });

    expect(response.json()).toEqual({ now: '2026-11-16T10:30:00.000Z' });
  });

  it('approves and rejects HR claims, and returns 404 for an unknown claim', async () => {
    ctx = await buildApiContext();
    await ctx.hr.submitClaim(
      { employeeId: 'anna', amount: { amountMinor: 100, currency: 'NOK' }, description: 'x', receiptRef: 'r' },
      'refill_1',
    );

    const approve = await ctx.app.inject({ method: 'POST', url: '/dev/hr/claim_1/approve' });
    const unknown = await ctx.app.inject({ method: 'POST', url: '/dev/hr/claim_404/reject' });

    expect(approve.json()).toEqual({ claimId: 'claim_1', status: 'APPROVED' });
    expect(await ctx.hr.getClaimStatus('claim_1')).toBe('APPROVED');
    expect(unknown.statusCode).toBe(404);
  });

  it('are not registered without dev tools', async () => {
    ctx = await buildApiContext({ devRoutes: false });

    const response = await ctx.app.inject({ method: 'GET', url: '/dev/outbox' });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });
});
