import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import type { Env } from '../../config/env.validation.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256', issuer: 'app-turnos' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'app-turnos' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    RefreshTokenService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [PasswordService],
})
export class AuthModule {}
