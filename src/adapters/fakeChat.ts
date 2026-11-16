import { Clock } from '../clock';
import { Office } from '../domain/types';
import { ChatPort } from './chatPort';

export type ChatMessageKind = 'direct' | 'office' | 'management';

export interface ChatMessage {
  kind: ChatMessageKind;
  to: string; // employeeId, office name, or 'management'
  text: string;
  at: Date;
}

// Stand-in for the chat tool: records every message so tests and the demo
// can see exactly what would have been sent.
export class FakeChat implements ChatPort {
  readonly outbox: ChatMessage[] = [];

  constructor(private readonly clock: Clock) {}

  async sendDirect(employeeId: string, text: string): Promise<void> {
    this.record('direct', employeeId, text);
  }

  async postToOffice(office: Office, text: string): Promise<void> {
    this.record('office', office, text);
  }

  async notifyManagement(text: string): Promise<void> {
    this.record('management', 'management', text);
  }

  messagesTo(employeeId: string): ChatMessage[] {
    return this.outbox.filter((message) => message.kind === 'direct' && message.to === employeeId);
  }

  officeMessages(office: Office): ChatMessage[] {
    return this.outbox.filter((message) => message.kind === 'office' && message.to === office);
  }

  managementMessages(): ChatMessage[] {
    return this.outbox.filter((message) => message.kind === 'management');
  }

  private record(kind: ChatMessageKind, to: string, text: string): void {
    this.outbox.push({ kind, to, text, at: this.clock.now() });
  }
}
