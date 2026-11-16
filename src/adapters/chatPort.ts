import { Office } from '../domain/types';

// The company chat tool, as the core sees it. The real integration would
// implement this; tests and the demo use FakeChat.
export interface ChatPort {
  sendDirect(employeeId: string, text: string): Promise<void>;
  postToOffice(office: Office, text: string): Promise<void>;
  notifyManagement(text: string): Promise<void>;
}
