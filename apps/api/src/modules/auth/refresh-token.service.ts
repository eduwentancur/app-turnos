import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Env } from '../../config/env.validation.js';

/**
 * El token se acaba de rotar en otra request (ej. dos pestañas refrescando a la vez).
 * No es un robo: el cliente debe reintentar con la cookie nueva.
 */
export class RefreshRaceException extends UnauthorizedException {
  constructor() {
    super({ error: 'RefreshRace', message: 'La sesión se renovó en otra pestaña, reintentá' });
  }
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

/**
 * Refresh tokens opacos y rotativos.
 * - En la base solo se guarda el SHA-256 del token.
 * - Cada uso lo revoca y emite uno nuevo.
 * - Reusar un token ya revocado se trata como robo: se revocan todas las sesiones del usuario.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);
  private readonly ttlMs: number;
  /** Ventana en la que reusar un token recién rotado se considera carrera y no robo. */
  private static readonly RACE_GRACE_MS = 10_000;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs =
      config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 24 * 60 * 60 * 1000;
  }

  async issue(userId: string): Promise<IssuedRefreshToken> {
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hashToken(token), expiresAt },
    });
    return { token, expiresAt };
  }

  /** Valida el token, lo revoca y devuelve uno nuevo junto con el userId. */
  async rotate(token: string): Promise<IssuedRefreshToken & { userId: string }> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });

    if (!stored) throw new UnauthorizedException('Sesión inválida');

    if (stored.revokedAt) {
      if (Date.now() - stored.revokedAt.getTime() < RefreshTokenService.RACE_GRACE_MS) {
        throw new RefreshRaceException();
      }
      this.logger.warn(
        `Reuso de refresh token revocado (user ${stored.userId}): se cierran todas las sesiones`,
      );
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedException('Sesión inválida');
    }

    if (stored.expiresAt <= new Date()) {
      throw new UnauthorizedException('La sesión expiró');
    }

    // Revocación condicional: si dos requests rotan el mismo token a la vez, solo una gana.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new RefreshRaceException();

    const next = await this.issue(stored.userId);
    return { ...next, userId: stored.userId };
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
