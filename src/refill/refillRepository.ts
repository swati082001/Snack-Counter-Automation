import { isBoxEmpty } from '../domain/refillStateMachine';
import { Office, Refill, RefillState } from '../domain/types';
import { NotFoundError, ValidationError, VersionConflictError } from '../errors';

export interface RefillRepository {
  create(refill: Refill): Promise<void>; // throws VersionConflictError if the office already has a box-empty refill
  get(id: string): Promise<Refill | null>;
  findActiveByOffice(office: Office): Promise<Refill | null>; // the refill whose box is still empty, if any
  list(filter?: { office?: Office; state?: RefillState }): Promise<Refill[]>;
  save(refill: Refill, expectedVersion: number): Promise<void>; // throws VersionConflictError
}

export interface InMemoryRefillRepositoryOptions {
  // Test mode: pause between reading and writing so two concurrent calls
  // really interleave, and a test proves the version check instead of luck.
  yieldBetweenCalls?: boolean;
}

// Optimistic locking: every save must name the version it read. If someone
// else saved in between, the versions differ and the save is refused.
// Stores and returns copies so nobody can change stored state without save().
export class InMemoryRefillRepository implements RefillRepository {
  private readonly refills = new Map<string, Refill>();

  constructor(private readonly options: InMemoryRefillRepositoryOptions = {}) {}

  async create(refill: Refill): Promise<void> {
    await this.pause();
    if (this.refills.has(refill.id)) {
      throw new ValidationError(`Refill ${refill.id} already exists`);
    }
    if (isBoxEmpty(refill.state) && this.findBoxEmpty(refill.office)) {
      throw new VersionConflictError(`Office ${refill.office} already has an active refill`);
    }
    this.refills.set(refill.id, structuredClone(refill));
  }

  async get(id: string): Promise<Refill | null> {
    const refill = this.refills.get(id);
    const copy = refill ? structuredClone(refill) : null;
    await this.pause();
    return copy;
  }

  async findActiveByOffice(office: Office): Promise<Refill | null> {
    const refill = this.findBoxEmpty(office);
    const copy = refill ? structuredClone(refill) : null;
    await this.pause();
    return copy;
  }

  async list(filter: { office?: Office; state?: RefillState } = {}): Promise<Refill[]> {
    return [...this.refills.values()]
      .filter((refill) => filter.office === undefined || refill.office === filter.office)
      .filter((refill) => filter.state === undefined || refill.state === filter.state)
      .map((refill) => structuredClone(refill));
  }

  // The check and the write happen with no pause in between, so they are atomic.
  async save(refill: Refill, expectedVersion: number): Promise<void> {
    await this.pause();
    const stored = this.refills.get(refill.id);
    if (!stored) {
      throw new NotFoundError(`Refill ${refill.id} not found`);
    }
    if (stored.version !== expectedVersion) {
      throw new VersionConflictError(
        `Refill ${refill.id} is at version ${stored.version}, expected ${expectedVersion}`,
      );
    }
    this.refills.set(refill.id, { ...structuredClone(refill), version: expectedVersion + 1 });
  }

  private findBoxEmpty(office: Office): Refill | undefined {
    return [...this.refills.values()].find(
      (refill) => refill.office === office && isBoxEmpty(refill.state),
    );
  }

  private async pause(): Promise<void> {
    if (this.options.yieldBetweenCalls) {
      await Promise.resolve();
    }
  }
}
