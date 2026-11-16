import { Availability, Office, Volunteer } from '../domain/types';
import { NotFoundError } from '../errors';
import { VolunteerRepository } from './volunteerRepository';

export interface VolunteerStatusUpdate {
  availability: Availability;
  currentOffice: Office; // set to the other office while visiting
}

// Volunteers set their own status in chat (office, remote or away, and where
// they are this week). The next offer uses it straight away.
export async function setVolunteerStatus(
  volunteers: VolunteerRepository,
  employeeId: string,
  update: VolunteerStatusUpdate,
): Promise<Volunteer> {
  const volunteer = await volunteers.get(employeeId);
  if (!volunteer) {
    throw new NotFoundError(`Volunteer ${employeeId} not found`);
  }
  const updated = { ...volunteer, availability: update.availability, currentOffice: update.currentOffice };
  await volunteers.upsert(updated);
  return updated;
}
