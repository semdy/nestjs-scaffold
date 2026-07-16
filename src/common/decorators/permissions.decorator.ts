import { SetMetadata } from '@nestjs/common';
import { PERMISSIONS_KEY, PermissionCodeValue } from '../constants';

export const Permissions = (...permissions: PermissionCodeValue[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
