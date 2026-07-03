import { AuthenticatedUser } from '../../auth/authenticated-user.interface';

export interface HttpRequestContext {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  requestId?: string;
  tenantId?: string;
  user?: AuthenticatedUser;
}
