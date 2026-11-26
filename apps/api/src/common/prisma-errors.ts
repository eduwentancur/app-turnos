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
