import { UserRole } from '../common/constants';

export interface AuthenticatedUser {
  sub: string;
  tenantId: string;
  email: string;
  role: UserRole;
  active: boolean;
}
