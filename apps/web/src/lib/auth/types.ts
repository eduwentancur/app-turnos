export type UserRole = "OWNER" | "STAFF";

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

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";
