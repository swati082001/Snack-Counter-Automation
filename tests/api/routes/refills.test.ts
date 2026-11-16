import { afterEach, describe, expect, it } from 'vitest';
import { ApiContext, buildApiContext } from '../../support/apiContext';

const PURCHASE_BODY = {
  volunteerId: 'anna',
  amountMinor: 50_000,
  currency: 'NOK',
  items: [{ name: 'Chips', quantity: 5 }],
  receiptRef: 'receipt_1',
};

describe('refill routes', () => {
  let ctx: ApiContext;

  afterEach(async () => {
    await ctx.app.close();
  });

  async function report(office = 'OSLO', reportedBy = 'dina') {
    return ctx.app.inject({ method: 'POST', url: '/refills', payload: { office, reportedBy } });
  }

  it('POST /refills answers 201 for a new refill and 200 for the one already open', async () => {
    ctx = await buildApiContext();

    const first = await report();
    const second = await report('OSLO', 'bjorn');

    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ id: 'refill_1', state: 'OPEN', currentOffer: { volunteerId: 'anna' } });
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe('refill_1');
  });

  it('returns dates as ISO 8601 strings', async () => {
    ctx = await buildApiContext();

    const body = (await report()).json();

    expect(body.createdAt).toBe('2026-11-16T09:00:00.000Z');
    expect(body.currentOffer.expiresAt).toBe('2026-11-16T11:00:00.000Z');
  });

  it('returns 400 with the error shape for a body that does not match the schema', async () => {
    ctx = await buildApiContext();

    const response = await ctx.app.inject({ method: 'POST', url: '/refills', payload: { office: 'PARIS' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: 'VALIDATION', message: expect.any(String) } });
  });

  it('returns 409 for the loser of a double accept', async () => {
    ctx = await buildApiContext();
    await report();

    const responses = await Promise.all([
      ctx.app.inject({ method: 'POST', url: '/refills/refill_1/accept', payload: { volunteerId: 'anna' } }),
      ctx.app.inject({ method: 'POST', url: '/refills/refill_1/accept', payload: { volunteerId: 'anna' } }),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const loser = responses.find((response) => response.statusCode === 409);
    expect(loser?.json().error.code).toBe('ALREADY_CLAIMED');
  });

  it('returns 403 when someone not offered tries to accept', async () => {
    ctx = await buildApiContext();
    await report();

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/refills/refill_1/accept',
      payload: { volunteerId: 'bjorn' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('NOT_OFFERED_TO_YOU');
  });

  it('declines and offers to the next person', async () => {
    ctx = await buildApiContext();
    await report();

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/refills/refill_1/decline',
      payload: { volunteerId: 'anna' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().currentOffer.volunteerId).toBe('bjorn');
  });

  it('records a purchase with 201, and refuses the wrong currency with 422', async () => {
    ctx = await buildApiContext();
    await report();
    await ctx.app.inject({ method: 'POST', url: '/refills/refill_1/accept', payload: { volunteerId: 'anna' } });

    const wrongCurrency = await ctx.app.inject({
      method: 'POST',
      url: '/refills/refill_1/purchase',
      payload: { ...PURCHASE_BODY, currency: 'INR' },
    });
    const purchase = await ctx.app.inject({
      method: 'POST',
      url: '/refills/refill_1/purchase',
      payload: PURCHASE_BODY,
    });

    expect(wrongCurrency.statusCode).toBe(422);
    expect(wrongCurrency.json().error.code).toBe('CURRENCY_MISMATCH');
    expect(purchase.statusCode).toBe(201);
    expect(purchase.json()).toMatchObject({
      refill: { state: 'CLAIM_SUBMITTED' },
      purchase: { amount: { amountMinor: 50_000, currency: 'NOK' }, hrStatus: 'PENDING' },
    });
  });

  it('cancels a refill', async () => {
    ctx = await buildApiContext();
    await report();

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/refills/refill_1/cancel',
      payload: { byEmployeeId: 'carl', reason: 'Refilled it myself' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().state).toBe('CANCELLED');
  });

  it('gets one refill with history, lists with filters, and returns 404 for an unknown id', async () => {
    ctx = await buildApiContext();
    await report('OSLO');
    await report('BENGALURU', 'ravi');

    const one = await ctx.app.inject({ method: 'GET', url: '/refills/refill_1' });
    const oslo = await ctx.app.inject({ method: 'GET', url: '/refills?office=OSLO&state=OPEN' });
    const missing = await ctx.app.inject({ method: 'GET', url: '/refills/refill_404' });

    expect(one.json().history.map((entry: { event: string }) => entry.event)).toEqual([
      'REPORTED',
      'OPENED',
      'OFFERED',
    ]);
    expect(oslo.json().map((refill: { id: string }) => refill.id)).toEqual(['refill_1']);
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('NOT_FOUND');
  });
});
