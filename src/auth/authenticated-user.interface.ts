export interface AuthenticatedUser {
  sub: string;
  tenantId: string;
  email?: string;
  active: boolean;
  iat?: number;
}
