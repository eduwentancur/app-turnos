import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Hash de contraseñas con Argon2id (parámetros recomendados por OWASP).
 * Aislado detrás de un servicio para poder cambiar el algoritmo sin tocar AuthService.
 */
@Injectable()
export class PasswordService {
  private static readonly OPTIONS = {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  hash(plain: string): Promise<string> {
    return hash(plain, PasswordService.OPTIONS);
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain);
    } catch {
      return false;
    }
  }
}
