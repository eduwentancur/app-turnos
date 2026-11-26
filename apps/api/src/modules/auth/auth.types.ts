import type { UserRole } from '../../generated/prisma/enums.js';

/** Contenido del access token (JWT). */
export interface JwtPayload {
  sub: string;
  barbershopId: string;
  role: UserRole;
}

/** Usuario autenticado disponible en cada request protegido. */
export interface AuthUser {
  userId: string;
  barbershopId: string;
  role: UserRole;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  barbershop: { id: string; name: string };
}

export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  user: PublicUser;
}

export const REFRESH_COOKIE = 'bf_rt';
export const REFRESH_COOKIE_PATH = '/api/auth';
