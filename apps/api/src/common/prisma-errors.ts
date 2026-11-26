import { Prisma } from '../generated/prisma/client.js';

type KnownError = Prisma.PrismaClientKnownRequestError;

function isKnown(error: unknown): error is KnownError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

/** Violación de una restricción UNIQUE. */
export const isUniqueViolation = (error: unknown): error is KnownError =>
  isKnown(error) && error.code === 'P2002';

/** El registro a actualizar/borrar no existe. */
export const isRecordNotFound = (error: unknown): error is KnownError =>
  isKnown(error) && error.code === 'P2025';

/** Violación de clave foránea (ej. borrar algo referenciado). */
export const isForeignKeyViolation = (error: unknown): error is KnownError =>
  isKnown(error) && error.code === 'P2003';

/**
 * Violación de la exclusion constraint `appointments_no_overlap` (SQLSTATE 23P01):
 * otro turno ocupó ese horario al mismo tiempo. Prisma la reporta vía el driver adapter.
 */
export function isOverlapViolation(error: unknown): boolean {
  if (!isKnown(error)) return false;
  const cause = (error.meta as { driverAdapterError?: { cause?: { originalCode?: string } } } | undefined)
    ?.driverAdapterError?.cause;
  return cause?.originalCode === '23P01';
}
