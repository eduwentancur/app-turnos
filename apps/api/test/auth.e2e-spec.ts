import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { REFRESH_COOKIE } from '../src/modules/auth/auth.types.js';
import { createTestApp } from './utils/create-test-app.js';

/** Extrae la cookie de refresh de un Set-Cookie. */
function refreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (!cookie) throw new Error('No vino la cookie de refresh');
  return cookie.split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e-${suffix}@test.local`;
  const password = 'ClaveSegura123';
  let barbershopId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const passwords = app.get(PasswordService);

    const shop = await prisma.barbershop.create({
      data: { name: `E2E ${suffix}`, slug: `e2e-${suffix}` },
    });
    barbershopId = shop.id;
    await prisma.user.create({
      data: {
        barbershopId,
        email,
        name: 'Admin E2E',
        passwordHash: await passwords.hash(password),
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { barbershopId } });
    await prisma.barbershop.delete({ where: { id: barbershopId } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('rechaza endpoints protegidos sin token', async () => {
    await http().get('/api/auth/me').expect(401);
  });

  it('valida el body del login', async () => {
    const res = await http().post('/api/auth/login').send({ email: 'no-es-email' }).expect(400);
    expect(res.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('email')]),
    );
  });

  it('rechaza credenciales incorrectas con un mensaje genérico', async () => {
    const res = await http()
      .post('/api/auth/login')
      .send({ email, password: 'incorrecta' })
      .expect(401);
    expect(res.body.message).toBe('Email o contraseña incorrectos');
  });

  it('login → me → refresh rota la sesión → reusar el token viejo cierra todo → logout', async () => {
    // Login (email con mayúsculas y espacios se normaliza)
    const login = await http()
      .post('/api/auth/login')
      .send({ email: `  ${email.toUpperCase()} `, password })
      .expect(200);
    expect(login.body.user).toMatchObject({ email, role: 'OWNER' });
    const firstCookie = refreshCookie(login);
    expect(login.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);

    // Me
    const me = await http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.barbershop.id).toBe(barbershopId);

    // Refresh: entrega una cookie nueva
    const refreshed = await http().post('/api/auth/refresh').set('Cookie', firstCookie).expect(200);
    const secondCookie = refreshCookie(refreshed);
    expect(secondCookie).not.toBe(firstCookie);

    // Reusar la cookie vieja enseguida = carrera entre pestañas → 401 RefreshRace, sin cerrar sesiones
    const race = await http().post('/api/auth/refresh').set('Cookie', firstCookie).expect(401);
    expect(race.body.error).toBe('RefreshRace');

    // Reusar la cookie vieja pasada la ventana de gracia = posible robo → se revocan todas las sesiones
    await prisma.refreshToken.updateMany({
      where: { user: { email } , revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });
    await http().post('/api/auth/refresh').set('Cookie', firstCookie).expect(401);
    await http().post('/api/auth/refresh').set('Cookie', secondCookie).expect(401);

    // Nueva sesión y logout la invalida
    const relogin = await http().post('/api/auth/login').send({ email, password }).expect(200);
    const cookie = refreshCookie(relogin);
    await http().post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await http().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('cambiar la contraseña invalida las sesiones anteriores', async () => {
    const login = await http().post('/api/auth/login').send({ email, password }).expect(200);
    const oldCookie = refreshCookie(login);

    const newPassword = 'OtraClaveSegura456';
    await http()
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: password, newPassword })
      .expect(200);

    await http().post('/api/auth/refresh').set('Cookie', oldCookie).expect(401);
    await http().post('/api/auth/login').send({ email, password }).expect(401);
  });
});
