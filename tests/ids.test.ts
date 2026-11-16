import { describe, expect, it } from 'vitest';
import { SequentialIdGenerator, UuidIdGenerator } from '../src/ids';

describe('SequentialIdGenerator', () => {
  it('counts from 1 separately for each prefix', () => {
    const ids = new SequentialIdGenerator();

    expect(ids.next('refill')).toBe('refill_1');
    expect(ids.next('refill')).toBe('refill_2');
    expect(ids.next('purchase')).toBe('purchase_1');
    expect(ids.next('refill')).toBe('refill_3');
  });
});

describe('UuidIdGenerator', () => {
  it('returns unique ids with the prefix', () => {
    const ids = new UuidIdGenerator();
    const first = ids.next('refill');
    const second = ids.next('refill');

    expect(first).toMatch(/^refill_[0-9a-f-]{36}$/);
    expect(first).not.toBe(second);
  });
});
