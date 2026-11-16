import { FakeChat } from '../adapters/fakeChat';
import { FakeHr } from '../adapters/fakeHr';
import { AdvanceableClock } from '../clock';
import { AppConfig } from '../config';
import { PurchaseRepository } from '../refill/purchaseRepository';
import { RefillCoordinator } from '../refill/refillCoordinator';
import { RefillRepository } from '../refill/refillRepository';
import { VolunteerRepository } from '../volunteers/volunteerRepository';

// Everything the HTTP layer needs. Tests build it from fakes; the
// composition root (server.ts) builds it for the running server.
export interface AppDeps {
  coordinator: RefillCoordinator;
  refills: RefillRepository;
  volunteers: VolunteerRepository;
  purchases: PurchaseRepository;
  config: AppConfig;
  dev?: DevTools; // present only in dev mode; enables the /dev routes
}

// Handles on the simulated outside world, for the demo routes.
export interface DevTools {
  chat: FakeChat;
  hr: FakeHr;
  clock: AdvanceableClock;
}
