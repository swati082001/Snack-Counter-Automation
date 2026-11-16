// All time in the core comes from an injected Clock, so tests control time
// with FakeClock (tests/support/fakeClock.ts) instead of waiting for real time.

export interface Clock {
  now(): Date;
}

// Real time. Only created in the composition root (src/api/server.ts).
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
