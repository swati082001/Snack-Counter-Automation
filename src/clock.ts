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

// A clock that can be moved forward on purpose: FakeClock in tests, and
// OffsetClock in the demo server (behind POST /dev/clock/advance).
export interface AdvanceableClock extends Clock {
  advance(ms: number): void;
}

// Real time plus a manual offset. Time keeps flowing normally, and the demo
// can jump ahead to show deadlines passing. Only created in the composition root.
export class OffsetClock implements AdvanceableClock {
  private offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }
}
