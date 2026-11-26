import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthUser, JwtPayload } from '../auth.types.js';

/**
 * Guard global: todo endpoint requiere access token salvo los marcados con @Public().
 * Seguro por defecto: un endpoint nuevo nace protegido.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const token = this.extractBearer(request);
    if (!token) throw new UnauthorizedException('Falta el token de acceso');

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      request.user = {
        userId: payload.sub,
        barbershopId: payload.barbershopId,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o vencido');
    }
  }

  private extractBearer(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : undefined;
  }
}
