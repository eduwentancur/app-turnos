# App Turnos

Sistema de gestión de turnos para barberías: los clientes reservan por WhatsApp y el dueño administra todo desde un panel web.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 |
| Backend | NestJS 12 (ESM) + TypeScript |
| Base de datos | PostgreSQL 17 (Docker en local) |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Validación | Zod (Standard Schema) |
| Tests | Vitest + Supertest |
| Monorepo | pnpm workspaces |

## Estructura

```
apps/
  api/        API NestJS (puerto 3001, prefijo /api)
  web/        Panel administrativo Next.js (puerto 3000)
packages/     Código compartido (tipos/schemas) — se usa desde el MVP
docker-compose.yml   PostgreSQL local
setup.ps1            Instalación automática en Windows
```

## Requisitos

- Node.js 22 o superior (recomendado 24 LTS)
- pnpm 10 (`npm i -g pnpm` o `corepack enable`)
- Docker Desktop (con WSL2 en Windows)
- Git

## Puesta en marcha

### Opción rápida (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
pnpm dev
```

### Manual

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm install          # también genera el cliente de Prisma
pnpm db:up            # levanta PostgreSQL
pnpm db:deploy        # aplica migraciones
# generá JWT_ACCESS_SECRET en apps/api/.env (ver comentario en .env.example)
SEED_ADMIN_EMAIL=tu@email.com pnpm db:seed   # muestra la contraseña inicial una vez
pnpm dev              # API + web en paralelo
```

- API: http://localhost:3001/api/health
- Panel: http://localhost:3000

## Scripts (raíz)

| Script | Qué hace |
|---|---|
| `pnpm dev` | API y web en modo desarrollo |
| `pnpm db:up` / `pnpm db:down` | Levanta / baja PostgreSQL |
| `pnpm db:migrate` | Crea y aplica una migración nueva (desarrollo) |
| `pnpm db:deploy` | Aplica migraciones pendientes |
| `pnpm db:seed` | Crea barbería, barbero y administrador (idempotente) |
| `pnpm db:studio` | Abre Prisma Studio |
| `pnpm build` / `pnpm lint` | Build y lint de ambas apps |
| `pnpm --filter api test` / `test:e2e` | Tests de la API |

## Decisiones de arquitectura

- **Monolito modular**: un módulo NestJS por dominio (`auth`, `services`, `schedules`, `availability`, `appointments`, `customers`, `whatsapp`). Controllers sin lógica de negocio; servicios sin conocimiento de HTTP.
- **Multi-tenant por fila**: cada entidad tiene `barbershopId`. Arranca con una barbería; sumar otra no requiere cambios de esquema.
- **Anti-solapamiento garantizado por PostgreSQL**: `EXCLUDE USING gist` sobre `(barberId, tstzrange(startsAt, endsAt))` para turnos `PENDING`/`CONFIRMED`. Cancelar libera el horario automáticamente. Ver la migración inicial.
- **Fechas en UTC** (`timestamptz`); los horarios semanales se guardan en hora local de la barbería (`timezone`).
- **Disponibilidad agrupada por franjas** (Mañana / Tarde / Noche, cortes configurables por barbería) para alimentar tanto el panel como las listas interactivas de WhatsApp (máx. 10 filas por mensaje).
- **Pago fuera del sistema**: se cobra en el local; el turno guarda `priceAtBooking` para estadísticas.

## Autenticación

- **Access token** JWT (HS256, 15 min) en memoria del navegador; se envía como `Authorization: Bearer`.
- **Refresh token** opaco y rotativo (7 días) en cookie `HttpOnly` + `SameSite=Strict`, path `/api/auth`. En la base solo se guarda su SHA-256.
- Reusar un refresh token ya rotado (fuera de una ventana de 10 s para carreras entre pestañas) revoca **todas** las sesiones del usuario.
- Contraseñas con **Argon2id**. Login limitado a 5 intentos/minuto por IP.
- Todo endpoint es privado por defecto; los públicos se marcan con `@Public()`.
- El panel llama a `/api/*` en su propio origen y Next.js lo reenvía a la API (sin CORS).

| Endpoint | Descripción |
|---|---|
| `POST /api/auth/login` | Email + contraseña → access token + cookie de refresh |
| `POST /api/auth/refresh` | Renueva la sesión (rota la cookie) |
| `POST /api/auth/logout` | Revoca la sesión actual |
| `GET /api/auth/me` | Usuario autenticado |
| `PATCH /api/auth/password` | Cambia la contraseña y cierra las demás sesiones |

## Servicios

| Endpoint | Rol | Descripción |
|---|---|---|
| `GET /api/services?includeInactive=true` | Todos | Lista (por defecto solo activos) |
| `GET /api/services/:id` | Todos | Detalle |
| `POST /api/services` | OWNER | Alta (se asigna a todos los barberos activos) |
| `PATCH /api/services/:id` | OWNER | Edición parcial / activar-desactivar |
| `DELETE /api/services/:id` | OWNER | Solo si no tiene turnos; si tiene, se desactiva |

- Nombre: 2–24 caracteres (límite de una fila de lista de WhatsApp), único por barbería sin distinguir mayúsculas.
- Duración: 5–480 min, múltiplo de 5. Precio: ≥ 0, hasta 2 decimales.

## Horarios y bloqueos

| Endpoint | Rol | Descripción |
|---|---|---|
| `GET /api/schedule/working-hours?barberId=` | Todos | Semana (7 días) con sus franjas en hora local |
| `PUT /api/schedule/working-hours` | OWNER | Reemplaza la semana completa (atómico) |
| `GET /api/schedule/time-offs?from=AAAA-MM-DD` | Todos | Bloqueos desde una fecha (por defecto hoy) |
| `POST /api/schedule/time-offs` | OWNER | Bloqueo de día(s) completo(s) o rango horario |
| `DELETE /api/schedule/time-offs/:id` | OWNER | Quita un bloqueo |

- Hasta 4 franjas por día, sin superposición (las franjas separadas modelan el descanso).
- Sin `barberId` = horario general de la barbería; con `barberId` = horario propio de ese barbero.
- Los bloqueos se reciben en fecha/hora local y se guardan en UTC según la zona horaria de la barbería.
  Al crear uno se informa cuántos turnos activos caen dentro (`conflictingAppointments`).

## Disponibilidad

| Endpoint | Descripción |
|---|---|
| `GET /api/availability?serviceId=&date=AAAA-MM-DD[&barberId=]` | Horarios libres del día agrupados en Mañana / Tarde / Noche |
| `GET /api/availability/days?serviceId=[&from=&days=14&barberId=]` | Cantidad de horarios libres por día |
| `GET /api/barbers` | Barberos de la barbería |

Cómo se calcula (`slot-calculator.ts`, función pura con tests unitarios):

1. Franjas del día: las propias del barbero si tiene, si no las generales de la barbería.
2. Se generan inicios cada `slotStepMinutes` (30 por defecto) donde el servicio entra completo antes del cierre.
3. Se descartan los que se superponen con turnos activos (`PENDING`/`CONFIRMED`) o bloqueos.
4. Se descartan los que empiezan dentro de los próximos 30 min. Se puede reservar hasta 60 días adelante.
5. Con varios barberos, un horario está libre si al menos uno lo está (`barberIds`).

`AvailabilityService.findFreeBarbers()` valida un horario puntual y es lo que usará la reserva antes de confirmar.
La pantalla **Vista del cliente** simula el flujo de WhatsApp (servicio → día → horario) con la paginación de 10 filas.

## Turnos

| Endpoint | Descripción |
|---|---|
| `GET /api/appointments?from=&to=[&status=&barberId=&includeCancelled=true]` | Turnos de un rango (máx. 62 días) |
| `GET /api/appointments/:id` | Detalle |
| `POST /api/appointments` | Reserva (cliente existente `customerId` o nuevo `customer: {name, phone}`) |
| `PATCH /api/appointments/:id/reschedule` | Reprograma a otro horario libre |
| `POST /api/appointments/:id/cancel` | Cancela y libera el horario |
| `PATCH /api/appointments/:id/status` | `COMPLETED` / `NO_SHOW` (después de la hora) |
| `GET /api/customers?search=` | Busca clientes por nombre o teléfono |

- Cada reserva se valida contra la disponibilidad real (`findFreeBarbers`) y, además, la exclusion
  constraint de PostgreSQL rechaza choques simultáneos → `409 Ese horario se acaba de ocupar`.
- El cliente se identifica por teléfono (como en WhatsApp). Se normaliza a E.164 con reglas para Argentina
  (`3764 123456` → `+5493764123456`).
- OWNER puede reservar fuera del horario de atención (`allowOutsideSchedule`); igual se evitan choques.
- El precio queda congelado en el turno (`priceAtBooking`) para estadísticas.

## Notas

- Las exclusion constraints no se pueden declarar en `schema.prisma`; viven en SQL dentro de las migraciones. Si en el futuro se regeneran migraciones, hay que conservarlas.
- El proyecto usa el puerto 5433 para no chocar con un Postgres instalado en Windows. Si también está ocupado, cambiá el mapeo en `docker-compose.yml` (ej. `"5434:5432"`) y ajustá `DATABASE_URL`.

## Roadmap

1. ✅ Etapa 1 — Preparación: monorepo, Prisma, PostgreSQL, health check
2. 🔄 Etapa 2 — MVP: ✅ auth admin · ✅ servicios · ✅ horarios · ✅ disponibilidad · ✅ turnos y calendario
3. ⏳ Etapa 3 — WhatsApp Cloud API: webhooks, bot de reservas, confirmaciones y recordatorios
