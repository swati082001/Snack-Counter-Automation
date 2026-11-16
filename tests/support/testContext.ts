import { FakeChat } from '../../src/adapters/fakeChat';
import { FakeHr } from '../../src/adapters/fakeHr';
import { AppConfig, DEFAULT_CONFIG } from '../../src/config';
import { Volunteer } from '../../src/domain/types';
import { SequentialIdGenerator } from '../../src/ids';
import { InMemoryPurchaseRepository } from '../../src/refill/purchaseRepository';
import { RefillCoordinator } from '../../src/refill/refillCoordinator';
import { InMemoryRefillRepository } from '../../src/refill/refillRepository';
import { InMemoryVolunteerRepository } from '../../src/volunteers/volunteerRepository';
import { buildVolunteer } from './builders';
import { FakeClock } from './fakeClock';

// Monday 16 November 2026, 10:00 in Oslo, 14:30 in Bengaluru.
export const TEST_START = new Date('2026-11-16T09:00:00.000Z');

// With nobody having refilled yet, the fairness order is alphabetical:
// anna, then bjorn, then carl in Oslo; ravi, then sita in Bengaluru.
export const DEFAULT_ROSTER: Volunteer[] = [
  buildVolunteer({ employeeId: 'anna', name: 'Anna' }),
  buildVolunteer({ employeeId: 'bjorn', name: 'Bjørn' }),
  buildVolunteer({ employeeId: 'carl', name: 'Carl' }),
  buildVolunteer({ employeeId: 'dina', name: 'Dina', availability: 'REMOTE' }),
  buildVolunteer({
    employeeId: 'ravi',
    name: 'Ravi',
    homeOffice: 'BENGALURU',
    currentOffice: 'BENGALURU',
    payrollCurrency: 'INR',
  }),
  buildVolunteer({
    employeeId: 'sita',
    name: 'Sita',
    homeOffice: 'BENGALURU',
    currentOffice: 'BENGALURU',
    payrollCurrency: 'INR',
  }),
];

export interface TestContext {
  clock: FakeClock;
  ids: SequentialIdGenerator;
  config: AppConfig;
  refills: InMemoryRefillRepository;
  volunteers: InMemoryVolunteerRepository;
  purchases: InMemoryPurchaseRepository;
  chat: FakeChat;
  hr: FakeHr;
  coordinator: RefillCoordinator;
}

// Everything wired together in memory, with a fake clock and predictable ids.
export async function buildTestContext(roster: Volunteer[] = DEFAULT_ROSTER): Promise<TestContext> {
  const clock = new FakeClock(TEST_START);
  const ids = new SequentialIdGenerator();
  const config = DEFAULT_CONFIG;
  const refills = new InMemoryRefillRepository({ yieldBetweenCalls: true });
  const volunteers = new InMemoryVolunteerRepository();
  const purchases = new InMemoryPurchaseRepository();
  const chat = new FakeChat(clock);
  const hr = new FakeHr();

  for (const volunteer of roster) {
    await volunteers.upsert(volunteer);
  }

  const coordinator = new RefillCoordinator({ refills, volunteers, purchases, chat, hr, clock, ids, config });
  return { clock, ids, config, refills, volunteers, purchases, chat, hr, coordinator };
}
