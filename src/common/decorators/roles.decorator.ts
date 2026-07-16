import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../constants';

/** Requires any one of the supplied role codes in the current tenant. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
