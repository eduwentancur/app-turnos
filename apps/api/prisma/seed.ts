/**
 * Seed inicial: crea la barbería piloto, su barbero y el usuario administrador.
 * Es idempotente: se puede correr varias veces sin duplicar datos ni pisar cambios
 * hechos desde el panel.
 *
 * Variables (en apps/api/.env o en el entorno):
 *   SEED_ADMIN_EMAIL     email del administrador (obligatoria)
 *   SEED_ADMIN_NAME      nombre visible del administrador
 *   SEED_ADMIN_PASSWORD  contraseña inicial (si falta, se genera una aleatoria y se muestra una vez)
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const BARBERSHOP = {
  slug: 'barberia-bf',
  name: 'Barbería B.F',
  address: 'Carlos Paz 5798, Posadas, Misiones',
  timezone: 'America/Argentina/Buenos_Aires',
};
const BARBER_NAME = 'Bruno';
const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
if (adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
  throw new Error(`SEED_ADMIN_EMAIL no es un email valido: ${adminEmail}`);
}
const adminName = process.env.SEED_ADMIN_NAME?.trim() || 'Administrador';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Falta DATABASE_URL en apps/api/.env');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

function generatePassword(): string {
  // 18 caracteres legibles (sin 0/O ni l/1)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(randomBytes(18), (b) => alphabet[b % alphabet.length]).join('');
}

async function main(): Promise<void> {
  const barbershop = await prisma.barbershop.upsert({
    where: { slug: BARBERSHOP.slug },
    update: {},
    create: BARBERSHOP,
  });
  console.log(`[OK] Barberia: ${barbershop.name}`);

  const existingBarber = await prisma.barber.findFirst({
    where: { barbershopId: barbershop.id, name: BARBER_NAME },
  });
  const barber =
    existingBarber ??
    (await prisma.barber.create({
      data: { barbershopId: barbershop.id, name: BARBER_NAME },
    }));
  console.log(`[OK] Barbero: ${barber.name}`);

  if (!adminEmail) {
    const admins = await prisma.user.count({ where: { barbershopId: barbershop.id } });
    if (admins > 0) {
      console.log('[OK] Administrador: ya existe (sin cambios)');
      return;
    }
    throw new Error('No hay administrador: defini SEED_ADMIN_EMAIL para crearlo');
  }

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingAdmin) {
    console.log(`[OK] Administrador: ${existingAdmin.email} (ya existia, contrasena sin cambios)`);
    return;
  }

  const providedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (providedPassword && providedPassword.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 8 caracteres');
  }
  const password = providedPassword ?? generatePassword();

  await prisma.user.create({
    data: {
      barbershopId: barbershop.id,
      email: adminEmail,
      name: adminName,
      role: 'OWNER',
      passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
    },
  });

  console.log(`[OK] Administrador: ${adminEmail}`);
  if (!providedPassword) {
    console.log('');
    console.log('  ==========================================================');
    console.log('   Contrasena inicial (se muestra UNA sola vez):');
    console.log(`   ${password}`);
    console.log('   Cambiala desde el panel despues del primer ingreso.');
    console.log('  ==========================================================');
  }
}

main()
  .catch((error: unknown) => {
    console.error('[ERROR] Error en el seed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
