import { Clock } from '../../src/clock';

// Test clock: time only moves when a test calls advance() or set().
export class FakeClock implements Clock {
  private current: Date;

  constructor(start: Date) {
    this.current = new Date(start.getTime());
  }

  // Returns a copy so callers cannot move the clock by mutating the result.
  now(): Date {
    return new Date(this.current.getTime());
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  set(date: Date): void {
    this.current = new Date(date.getTime());
  }
}
