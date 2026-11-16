import { HrStatus, Office, Purchase } from '../domain/types';
import { NotFoundError, ValidationError } from '../errors';

export interface PurchaseRepository {
  add(purchase: Purchase): Promise<void>;
  get(id: string): Promise<Purchase | null>;
  update(purchase: Purchase): Promise<void>;
  listByBuyer(employeeId: string): Promise<Purchase[]>;
  list(filter?: { office?: Office; hrStatus?: HrStatus }): Promise<Purchase[]>;
}

// Stores and returns copies, so a caller changing an object it got back
// cannot change what is stored without calling update().
export class InMemoryPurchaseRepository implements PurchaseRepository {
  private readonly purchases = new Map<string, Purchase>();

  async add(purchase: Purchase): Promise<void> {
    if (this.purchases.has(purchase.id)) {
      throw new ValidationError(`Purchase ${purchase.id} already exists`);
    }
    this.purchases.set(purchase.id, structuredClone(purchase));
  }

  async get(id: string): Promise<Purchase | null> {
    const purchase = this.purchases.get(id);
    return purchase ? structuredClone(purchase) : null;
  }

  async update(purchase: Purchase): Promise<void> {
    if (!this.purchases.has(purchase.id)) {
      throw new NotFoundError(`Purchase ${purchase.id} not found`);
    }
    this.purchases.set(purchase.id, structuredClone(purchase));
  }

  async listByBuyer(employeeId: string): Promise<Purchase[]> {
    const all = await this.list();
    return all.filter((purchase) => purchase.buyerId === employeeId);
  }

  async list(filter: { office?: Office; hrStatus?: HrStatus } = {}): Promise<Purchase[]> {
    return [...this.purchases.values()]
      .filter((purchase) => filter.office === undefined || purchase.office === filter.office)
      .filter((purchase) => filter.hrStatus === undefined || purchase.hrStatus === filter.hrStatus)
      .map((purchase) => structuredClone(purchase));
  }
}
