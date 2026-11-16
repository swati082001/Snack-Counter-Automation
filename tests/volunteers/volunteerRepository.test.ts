import { describe, expect, it } from 'vitest';
import { InMemoryVolunteerRepository } from '../../src/volunteers/volunteerRepository';
import { buildVolunteer } from '../support/builders';

describe('InMemoryVolunteerRepository', () => {
  it('stores volunteers and returns them by id and as a list', async () => {
    const repo = new InMemoryVolunteerRepository();
    await repo.upsert(buildVolunteer({ employeeId: 'anna' }));
    await repo.upsert(buildVolunteer({ employeeId: 'ravi', homeOffice: 'BENGALURU' }));

    expect((await repo.get('anna'))?.employeeId).toBe('anna');
    expect(await repo.get('missing')).toBeNull();
    expect((await repo.list()).map((volunteer) => volunteer.employeeId)).toEqual(['anna', 'ravi']);
  });

  it('replaces an existing volunteer on upsert', async () => {
    const repo = new InMemoryVolunteerRepository();
    await repo.upsert(buildVolunteer({ employeeId: 'anna', availability: 'OFFICE' }));

    await repo.upsert(buildVolunteer({ employeeId: 'anna', availability: 'AWAY' }));

    expect(await repo.list()).toHaveLength(1);
    expect((await repo.get('anna'))?.availability).toBe('AWAY');
  });

  it('keeps stored data safe from changes to objects passed in or returned', async () => {
    const repo = new InMemoryVolunteerRepository();
    const volunteer = buildVolunteer({ employeeId: 'anna' });
    await repo.upsert(volunteer);

    volunteer.optedIn = false;
    const returned = await repo.get('anna');
    expect(returned).not.toBeNull();
    if (returned) returned.availability = 'AWAY';

    expect(await repo.get('anna')).toMatchObject({ optedIn: true, availability: 'OFFICE' });
  });
});
