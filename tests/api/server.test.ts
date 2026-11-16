import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, createInMemoryDeps } from '../../src/api/server';
import { ApiContext, buildApiContext } from '../support/apiContext';

describe('full flow over HTTP', () => {
  let ctx: ApiContext;

  afterEach(async () => {
    await ctx.app.close();
  });

  it('report, accept, purchase, approve in dev route, sync, and the report shows the spend', async () => {
    ctx = await buildApiContext();
    const post = (url: string, payload?: object) => ctx.app.inject({ method: 'POST', url, payload });

    const reported = await post('/refills', { office: 'OSLO', reportedBy: 'dina' });
    expect(reported.statusCode).toBe(201);

    const accepted = await post('/refills/refill_1/accept', { volunteerId: 'anna' });
    expect(accepted.json().state).toBe('CLAIMED');

    const purchased = await post('/refills/refill_1/purchase', {
      volunteerId: 'anna',
      amountMinor: 54_900,
      currency: 'NOK',
      items: [
        { name: 'Chips', quantity: 5, lineTotalMinor: 24_900 },
        { name: 'Soda', quantity: 6, lineTotalMinor: 30_000 },
      ],
      receiptRef: 'receipt_42',
    });
    expect(purchased.statusCode).toBe(201);
    const claimId = purchased.json().purchase.hrClaimId;

    expect((await post(`/dev/hr/${claimId}/approve`)).statusCode).toBe(200);
    expect((await post('/admin/sync-hr')).statusCode).toBe(200);

    const refill = await ctx.app.inject({ method: 'GET', url: '/refills/refill_1' });
    expect(refill.json().state).toBe('REIMBURSED');

    const report = (await ctx.app.inject({ method: 'GET', url: '/reports/monthly?month=2026-11' })).json();
    expect(report.offices[0]).toMatchObject({ office: 'OSLO', spentMinor: 54_900, remainingMinor: 545_100 });
    expect(report.combinedTotal).toEqual({ amountMinor: 54_900, currency: 'NOK' });
    expect(report.bySnack[0]).toEqual({
      name: 'Soda',
      quantity: 6,
      spendInReportingCurrency: { amountMinor: 30_000, currency: 'NOK' },
    });
    expect(report.statusCounts).toEqual({ pendingHr: 0, reimbursed: 1, rejected: 0 });
  });
});

describe('composition root', () => {
  it('enables dev tools only in dev mode', () => {
    expect(createInMemoryDeps({ devMode: true }).dev).toBeDefined();
    expect(createInMemoryDeps({ devMode: false }).dev).toBeUndefined();
  });

  it('answers unknown routes with 404 and the error shape', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('answers malformed JSON with 400 and the error shape', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/refills',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: 'BAD_REQUEST', message: expect.any(String) } });
    await app.close();
  });
});
