import { afterEach, describe, expect, it } from 'vitest';
import { ApiContext, buildApiContext } from '../../support/apiContext';

describe('volunteer routes', () => {
  let ctx: ApiContext;

  afterEach(async () => {
    await ctx.app.close();
  });

  it('lists volunteers', async () => {
    ctx = await buildApiContext();

    const response = await ctx.app.inject({ method: 'GET', url: '/volunteers' });

    expect(response.statusCode).toBe(200);
    expect(response.json().map((volunteer: { employeeId: string }) => volunteer.employeeId)).toContain('anna');
  });

  it('sets availability and current office, and the next offer uses it', async () => {
    ctx = await buildApiContext();

    const away = await ctx.app.inject({
      method: 'PUT',
      url: '/volunteers/anna/status',
      payload: { availability: 'AWAY', currentOffice: 'OSLO' },
    });
    const report = await ctx.app.inject({
      method: 'POST',
      url: '/refills',
      payload: { office: 'OSLO', reportedBy: 'dina' },
    });

    expect(away.statusCode).toBe(200);
    expect(away.json()).toMatchObject({ employeeId: 'anna', availability: 'AWAY' });
    expect(report.json().currentOffer.volunteerId).toBe('bjorn');
  });

  it('returns 404 for an unknown volunteer and 400 for a bad status', async () => {
    ctx = await buildApiContext();

    const unknown = await ctx.app.inject({
      method: 'PUT',
      url: '/volunteers/nobody/status',
      payload: { availability: 'AWAY', currentOffice: 'OSLO' },
    });
    const badStatus = await ctx.app.inject({
      method: 'PUT',
      url: '/volunteers/anna/status',
      payload: { availability: 'ON_THE_MOON', currentOffice: 'OSLO' },
    });

    expect(unknown.statusCode).toBe(404);
    expect(badStatus.statusCode).toBe(400);
  });
});
