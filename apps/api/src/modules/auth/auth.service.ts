import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PasswordService } from './password.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import type { Env } from '../../config/env.validation.js';
import type {
  AuthSession,
  JwtPayload,
  PublicUser,
} from './auth.types.js';
import type { ChangePasswordInput, LoginInput } from './schemas/auth.schemas.js';

export interface SessionWithRefresh {
  session: AuthSession;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  passwordHash: true,
  barbershop: { select: { id: true, name: true } },
} as const;

@Injectable()
export class AuthService {
  private readonly accessTtl: number;
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTtl = config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  async login({ email, password }: LoginInput): Promise<SessionWithRefresh> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: userSelect,
    });

    // Siempre se verifica un hash (aunque el usuario no exista) para no revelar
    // por tiempo de respuesta qué emails están registrados.
    const hashToCheck = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await this.passwords.verify(hashToCheck, password);

    if (!user || !valid || !user.isActive) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }

    return this.createSession(user);
  }

  async refresh(refreshToken: string | undefined): Promise<SessionWithRefresh> {
    if (!refreshToken) throw new UnauthorizedException('No hay sesión activa');

    const rotated = await this.refreshTokens.rotate(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      select: userSelect,
    });
    if (!user || !user.isActive) {
      await this.refreshTokens.revokeAllForUser(rotated.userId);
      throw new UnauthorizedException('Sesión inválida');
    }

    return {
      session: this.buildSession(user),
      refreshToken: rotated.token,
      refreshExpiresAt: rotated.expiresAt,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.refreshTokens.revoke(refreshToken);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
    if (!user || !user.isActive) throw new NotFoundException('Usuario no encontrado');
    return this.toPublic(user);
  }

  /** Cambia la contraseña y cierra todas las demás sesiones. */
  async changePassword(
    userId: string,
    { currentPassword, newPassword }: ChangePasswordInput,
  ): Promise<SessionWithRefresh> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
    if (!user || !user.isActive) throw new UnauthorizedException();

    const valid = await this.passwords.verify(user.passwordHash, currentPassword);
    if (!valid) throw new UnauthorizedException('La contraseña actual es incorrecta');

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(newPassword) },
    });
    await this.refreshTokens.revokeAllForUser(userId);

    return this.createSession(user);
  }

  private async createSession(user: UserRecord): Promise<SessionWithRefresh> {
    const refresh = await this.refreshTokens.issue(user.id);
    return {
      session: this.buildSession(user),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  private buildSession(user: UserRecord): AuthSession {
    const payload: JwtPayload = {
      sub: user.id,
      barbershopId: user.barbershop.id,
      role: user.role,
    };
    return {
      accessToken: this.jwt.sign(payload, { expiresIn: this.accessTtl }),
      expiresIn: this.accessTtl,
      user: this.toPublic(user),
    };
  }

  private toPublic(user: UserRecord): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      barbershop: user.barbershop,
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash('dummy-password-for-timing');
    return this.dummyHash;
  }
}

type UserRecord = {
  id: string;
  email: string;
  name: string;
  role: PublicUser['role'];
  isActive: boolean;
  passwordHash: string;
  barbershop: { id: string; name: string };
};
