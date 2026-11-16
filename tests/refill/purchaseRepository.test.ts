import { describe, expect, it } from 'vitest';
import { InMemoryPurchaseRepository } from '../../src/refill/purchaseRepository';
import { NotFoundError, ValidationError } from '../../src/errors';
import { buildPurchase } from '../support/builders';

describe('InMemoryPurchaseRepository', () => {
  it('stores a purchase and returns it by id', async () => {
    const repo = new InMemoryPurchaseRepository();
    const purchase = buildPurchase({ id: 'p1' });

    await repo.add(purchase);

    expect(await repo.get('p1')).toEqual(purchase);
    expect(await repo.get('missing')).toBeNull();
  });

  it('keeps stored data safe from changes to objects passed in or returned', async () => {
    const repo = new InMemoryPurchaseRepository();
    const purchase = buildPurchase({ id: 'p1' });
    await repo.add(purchase);

    purchase.hrStatus = 'APPROVED';
    const returned = await repo.get('p1');
    expect(returned).not.toBeNull();
    returned?.items.push({ name: 'Extra', quantity: 1 });
    returned?.purchasedAt.setFullYear(2000);

    const stored = await repo.get('p1');
    expect(stored?.hrStatus).toBe('NOT_SUBMITTED');
    expect(stored?.items).toHaveLength(1);
    expect(stored?.purchasedAt.getFullYear()).toBe(2026);
  });

  it('rejects adding the same id twice', async () => {
    const repo = new InMemoryPurchaseRepository();
    await repo.add(buildPurchase({ id: 'p1' }));

    await expect(repo.add(buildPurchase({ id: 'p1' }))).rejects.toThrow(ValidationError);
  });

  it('updates an existing purchase and rejects updating an unknown one', async () => {
    const repo = new InMemoryPurchaseRepository();
    await repo.add(buildPurchase({ id: 'p1' }));

    await repo.update(buildPurchase({ id: 'p1', hrStatus: 'PENDING', hrClaimId: 'claim_1' }));

    expect(await repo.get('p1')).toMatchObject({ hrStatus: 'PENDING', hrClaimId: 'claim_1' });
    await expect(repo.update(buildPurchase({ id: 'unknown' }))).rejects.toThrow(NotFoundError);
  });

  it('lists by buyer, by office and by HR status', async () => {
    const repo = new InMemoryPurchaseRepository();
    await repo.add(buildPurchase({ id: 'p1', buyerId: 'anna', office: 'OSLO', hrStatus: 'PENDING' }));
    await repo.add(buildPurchase({ id: 'p2', buyerId: 'ravi', office: 'BENGALURU', hrStatus: 'PENDING' }));
    await repo.add(buildPurchase({ id: 'p3', buyerId: 'anna', office: 'OSLO', hrStatus: 'APPROVED' }));

    const ids = (purchases: { id: string }[]) => purchases.map((purchase) => purchase.id);

    expect(ids(await repo.list())).toEqual(['p1', 'p2', 'p3']);
    expect(ids(await repo.listByBuyer('anna'))).toEqual(['p1', 'p3']);
    expect(ids(await repo.list({ office: 'OSLO' }))).toEqual(['p1', 'p3']);
    expect(ids(await repo.list({ hrStatus: 'PENDING' }))).toEqual(['p1', 'p2']);
    expect(ids(await repo.list({ office: 'OSLO', hrStatus: 'PENDING' }))).toEqual(['p1']);
  });
});
