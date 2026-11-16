import { Volunteer } from '../domain/types';

export interface VolunteerRepository {
  get(employeeId: string): Promise<Volunteer | null>;
  list(): Promise<Volunteer[]>;
  upsert(volunteer: Volunteer): Promise<void>;
}

// Stores and returns copies, so a caller changing an object it got back
// cannot change what is stored without calling upsert().
export class InMemoryVolunteerRepository implements VolunteerRepository {
  private readonly volunteers = new Map<string, Volunteer>();

  async get(employeeId: string): Promise<Volunteer | null> {
    const volunteer = this.volunteers.get(employeeId);
    return volunteer ? structuredClone(volunteer) : null;
  }

  async list(): Promise<Volunteer[]> {
    return [...this.volunteers.values()].map((volunteer) => structuredClone(volunteer));
  }

  async upsert(volunteer: Volunteer): Promise<void> {
    this.volunteers.set(volunteer.employeeId, structuredClone(volunteer));
  }
}
