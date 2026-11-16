import { randomUUID } from 'node:crypto';

// All ids in the core come from an injected IdGenerator, so tests get
// predictable ids ('refill_1', 'refill_2', ...).
export interface IdGenerator {
  next(prefix: string): string;
}

// Deterministic: counts separately per prefix. Used in tests and the demo.
export class SequentialIdGenerator implements IdGenerator {
  private readonly counters = new Map<string, number>();

  next(prefix: string): string {
    const count = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, count);
    return `${prefix}_${count}`;
  }
}

// Unique across restarts. Only created in the composition root (src/api/server.ts).
export class UuidIdGenerator implements IdGenerator {
  next(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }
}
