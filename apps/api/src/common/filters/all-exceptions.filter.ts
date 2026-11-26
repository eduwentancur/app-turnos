import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  isForeignKeyViolation,
  isRecordNotFound,
  isUniqueViolation,
} from '../prisma-errors.js';

export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * Formato único de error para toda la API.
 * Los errores no controlados se loguean completos pero nunca se exponen al cliente.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, error, message } = this.resolve(exception);

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponse = {
      statusCode,
      error,
      message,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    };
    response.status(statusCode).json(body);
  }

  private resolve(exception: unknown): Omit<ErrorResponse, 'path' | 'timestamp'> {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return { statusCode, error: exception.name, message: res };
      }
      const r = res as { error?: string; message?: string | string[] };
      return {
        statusCode,
        error: r.error ?? exception.name,
        message: r.message ?? exception.message,
      };
    }

    // Red de seguridad: errores de base no traducidos por el servicio
    if (isUniqueViolation(exception)) {
      return { statusCode: HttpStatus.CONFLICT, error: 'Conflict', message: 'El registro ya existe' };
    }
    if (isRecordNotFound(exception)) {
      return { statusCode: HttpStatus.NOT_FOUND, error: 'Not Found', message: 'Registro no encontrado' };
    }
    if (isForeignKeyViolation(exception)) {
      return {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: 'El registro está en uso y no se puede modificar así',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Ocurrió un error inesperado',
    };
  }
}
