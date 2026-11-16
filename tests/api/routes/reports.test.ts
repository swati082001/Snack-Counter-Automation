import { afterEach, describe, expect, it } from 'vitest';
import { ApiContext, buildApiContext } from '../../support/apiContext';

describe('report routes', () => {
  let ctx: ApiContext;

  afterEach(async () => {
    await ctx.app.close();
  });

  it('returns the monthly report', async () => {
    ctx = await buildApiContext();

    const response = await ctx.app.inject({ method: 'GET', url: '/reports/monthly?month=2026-11' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      month: '2026-11',
      reportingCurrency: 'NOK',
      combinedTotal: { amountMinor: 0, currency: 'NOK' },
    });
  });

  it.each(['', '?month=2026-13', '?month=November'])('returns 400 without a valid month (%s)', async (query) => {
    ctx = await buildApiContext();

    const response = await ctx.app.inject({ method: 'GET', url: `/reports/monthly${query}` });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION');
  });
});
