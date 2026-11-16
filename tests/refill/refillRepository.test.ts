import { describe, expect, it } from 'vitest';
import { InMemoryRefillRepository } from '../../src/refill/refillRepository';
import { NotFoundError, ValidationError, VersionConflictError } from '../../src/errors';
import { buildRefill } from '../support/builders';

describe('InMemoryRefillRepository', () => {
  it('stores a refill and returns a copy that cannot change stored state', async () => {
    const repo = new InMemoryRefillRepository();
    await repo.create(buildRefill({ id: 'r1' }));

    const copy = await repo.get('r1');
    copy?.excludedVolunteerIds.push('anna');

    expect((await repo.get('r1'))?.excludedVolunteerIds).toEqual([]);
    expect(await repo.get('missing')).toBeNull();
  });

  it('saves with the expected version and increases the version by one', async () => {
    const repo = new InMemoryRefillRepository();
    await repo.create(buildRefill({ id: 'r1', version: 1 }));

    await repo.save(buildRefill({ id: 'r1', version: 1, state: 'CLAIMED' }), 1);

    expect(await repo.get('r1')).toMatchObject({ state: 'CLAIMED', version: 2 });
  });

  it('refuses a save based on a stale version', async () => {
    const repo = new InMemoryRefillRepository();
    await repo.create(buildRefill({ id: 'r1', version: 1 }));
    await repo.save(buildRefill({ id: 'r1' }), 1);

    await expect(repo.save(buildRefill({ id: 'r1', state: 'CANCELLED' }), 1)).rejects.toThrow(VersionConflictError);
    expect((await repo.get('r1'))?.state).toBe('OPEN');
  });

  it('lets exactly one of two concurrent saves of the same version win', async () => {
    const repo = new InMemoryRefillRepository({ yieldBetweenCalls: true });
    await repo.create(buildRefill({ id: 'r1', version: 1 }));

    const results = await Promise.allSettled([
      repo.save(buildRefill({ id: 'r1', claimedBy: 'anna' }), 1),
      repo.save(buildRefill({ id: 'r1', claimedBy: 'bjorn' }), 1),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await repo.get('r1'))?.version).toBe(2);
  });

  it('refuses saving an unknown refill and creating the same id twice', async () => {
    const repo = new InMemoryRefillRepository();
    await repo.create(buildRefill({ id: 'r1', state: 'CANCELLED' }));

    await expect(repo.save(buildRefill({ id: 'r2' }), 1)).rejects.toThrow(NotFoundError);
    await expect(repo.create(buildRefill({ id: 'r1', state: 'CANCELLED' }))).rejects.toThrow(ValidationError);
  });

  it('allows only one box-empty refill per office', async () => {
    const repo = new InMemoryRefillRepository();
    await repo.create(buildRefill({ id: 'r1', office: 'OSLO', state: 'OPEN' }));

    await expect(repo.create(buildRefill({ id: 'r2', office: 'OSLO', state: 'OPEN' }))).rejects.toThrow(
      VersionConflictError,
    );
    await repo.create(buildRefill({ id: 'r3', office: 'BENGALURU', state: 'OPEN' }));
  });

  it('finds the box-empty refill of an office, ignoring purchased and finished ones', async () => {
    const repo = new InMemoryRefillRepository();
    await repo.create(buildRefill({ id: 'r1', office: 'OSLO', state: 'CLAIM_SUBMITTED' }));
    await repo.create(buildRefill({ id: 'r2', office: 'OSLO', state: 'CANCELLED' }));

    expect(await repo.findActiveByOffice('OSLO')).toBeNull();

    await repo.create(buildRefill({ id: 'r3', office: 'OSLO', state: 'CLAIMED' }));
    expect((await repo.findActiveByOffice('OSLO'))?.id).toBe('r3');
    expect(await repo.findActiveByOffice('BENGALURU')).toBeNull();
  });

  it('lists by office and by state', async () => {
    const repo = new InMemoryRefillRepository();
    await repo.create(buildRefill({ id: 'r1', office: 'OSLO', state: 'OPEN' }));
    await repo.create(buildRefill({ id: 'r2', office: 'BENGALURU', state: 'OPEN' }));
    await repo.create(buildRefill({ id: 'r3', office: 'OSLO', state: 'CANCELLED' }));

    const ids = async (filter?: Parameters<InMemoryRefillRepository['list']>[0]) =>
      (await repo.list(filter)).map((refill) => refill.id);

    expect(await ids()).toEqual(['r1', 'r2', 'r3']);
    expect(await ids({ office: 'OSLO' })).toEqual(['r1', 'r3']);
    expect(await ids({ state: 'OPEN' })).toEqual(['r1', 'r2']);
  });
});
