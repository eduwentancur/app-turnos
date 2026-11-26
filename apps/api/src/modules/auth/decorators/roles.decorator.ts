import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../../generated/prisma/enums.js';

export const ROLES_KEY = 'roles';

/** Restringe un endpoint a ciertos roles: `@Roles('OWNER')`. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
