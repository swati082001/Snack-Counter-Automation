import { describe, expect, it } from 'vitest';
import { createMoney } from '../../src/money/money';
import { cancelledMessage, formatLocalTime, offerMessage } from '../../src/refill/messages';
import { buildRefill } from '../support/builders';

describe('chat messages', () => {
  it("shows times in the office's own time zone", () => {
    const instant = new Date('2026-11-16T09:00:00.000Z');

    expect(formatLocalTime(instant, 'Europe/Oslo')).toBe('16 Nov, 10:00');
    expect(formatLocalTime(instant, 'Asia/Kolkata')).toBe('16 Nov, 14:30');
  });

  it('puts refill id, office, deadline and budget left in the offer', () => {
    const refill = buildRefill({ id: 'refill_7', office: 'BENGALURU' });
    const offer = {
      volunteerId: 'ravi',
      offeredAt: new Date('2026-11-16T09:00:00.000Z'),
      expiresAt: new Date('2026-11-16T11:00:00.000Z'),
    };

    const text = offerMessage(refill, offer, createMoney(1_250_000, 'INR'), 'Asia/Kolkata');

    expect(text).toContain('refill_7');
    expect(text).toContain('BENGALURU');
    expect(text).toContain('16 Nov, 16:30');
    expect(text).toContain('12,500.00 INR');
  });

  it('includes the reason in the cancel message', () => {
    expect(cancelledMessage(buildRefill(), 'already restocked')).toContain('already restocked');
  });
});
