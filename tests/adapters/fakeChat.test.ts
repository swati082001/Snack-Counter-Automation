import { describe, expect, it } from 'vitest';
import { FakeChat } from '../../src/adapters/fakeChat';
import { FakeClock } from '../support/fakeClock';

describe('FakeChat', () => {
  it('records every message with its kind, recipient and time', async () => {
    const clock = new FakeClock(new Date('2026-11-16T09:00:00.000Z'));
    const chat = new FakeChat(clock);

    await chat.sendDirect('anna', 'hello anna');
    clock.advance(60_000);
    await chat.postToOffice('OSLO', 'hello oslo');
    await chat.notifyManagement('hello managers');

    expect(chat.outbox).toEqual([
      { kind: 'direct', to: 'anna', text: 'hello anna', at: new Date('2026-11-16T09:00:00.000Z') },
      { kind: 'office', to: 'OSLO', text: 'hello oslo', at: new Date('2026-11-16T09:01:00.000Z') },
      { kind: 'management', to: 'management', text: 'hello managers', at: new Date('2026-11-16T09:01:00.000Z') },
    ]);
    expect(chat.messagesTo('anna')).toHaveLength(1);
    expect(chat.messagesTo('bjorn')).toHaveLength(0);
    expect(chat.officeMessages('OSLO')).toHaveLength(1);
    expect(chat.officeMessages('BENGALURU')).toHaveLength(0);
    expect(chat.managementMessages()).toHaveLength(1);
  });
});
