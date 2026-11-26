import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService, type SessionWithRefresh } from './auth.service.js';
import { RefreshRaceException } from './refresh-token.service.js';
import { Public } from './decorators/public.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import {
  changePasswordSchema,
  loginSchema,
  type ChangePasswordInput,
  type LoginInput,
} from './schemas/auth.schemas.js';
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  type AuthSession,
  type AuthUser,
  type PublicUser,
} from './auth.types.js';
import type { Env } from '../../config/env.validation.js';

@Controller('auth')
export class AuthController {
  private readonly cookieBase: CookieOptions;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.cookieBase = {
      httpOnly: true,
      secure: config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    };
  }

  /** Máx. 5 intentos por minuto por IP (fuerza bruta). */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body({ schema: loginSchema }) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.sendSession(res, await this.auth.login(body));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    try {
      return this.sendSession(res, await this.auth.refresh(this.readCookie(req)));
    } catch (error) {
      // En una carrera la cookie del navegador ya es la nueva: no hay que borrarla
      if (!(error instanceof RefreshRaceException)) {
        res.clearCookie(REFRESH_COOKIE, this.cookieBase);
      }
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(this.readCookie(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieBase);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<PublicUser> {
    return this.auth.me(user.userId);
  }

  @Patch('password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body({ schema: changePasswordSchema }) body: ChangePasswordInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.sendSession(res, await this.auth.changePassword(user.userId, body));
  }

  private sendSession(res: Response, result: SessionWithRefresh): AuthSession {
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...this.cookieBase,
      expires: result.refreshExpiresAt,
    });
    return result.session;
  }

  private readCookie(req: Request): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
