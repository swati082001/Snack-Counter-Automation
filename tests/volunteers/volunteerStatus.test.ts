import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/errors';
import { InMemoryVolunteerRepository } from '../../src/volunteers/volunteerRepository';
import { setVolunteerStatus } from '../../src/volunteers/volunteerStatus';
import { buildVolunteer } from '../support/builders';

describe('setVolunteerStatus', () => {
  it('updates availability and current office, keeping home office and payroll', async () => {
    const volunteers = new InMemoryVolunteerRepository();
    await volunteers.upsert(buildVolunteer({ employeeId: 'priya', homeOffice: 'BENGALURU', payrollCurrency: 'INR' }));

    const updated = await setVolunteerStatus(volunteers, 'priya', { availability: 'OFFICE', currentOffice: 'OSLO' });

    expect(updated).toMatchObject({
      availability: 'OFFICE',
      currentOffice: 'OSLO',
      homeOffice: 'BENGALURU',
      payrollCurrency: 'INR',
    });
    expect(await volunteers.get('priya')).toEqual(updated);
  });

  it('throws NotFoundError for an unknown volunteer', async () => {
    const volunteers = new InMemoryVolunteerRepository();

    await expect(
      setVolunteerStatus(volunteers, 'nobody', { availability: 'AWAY', currentOffice: 'OSLO' }),
    ).rejects.toThrow(NotFoundError);
  });
});
