import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import type { AuthenticatedRequest } from './guards';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<AuthenticatedRequest>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado. Intente nuevamente.',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      body =
        typeof res === 'string'
          ? { statusCode: status, code: 'HTTP_ERROR', message: res }
          : { statusCode: status, ...(res as Record<string, unknown>) };
      if (!body.message) body.message = exception.message;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        body = {
          statusCode: status,
          code: 'DUPLICATE',
          message: 'Ya existe un registro con esos datos.',
          fields: exception.meta?.target,
        };
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        body = {
          statusCode: status,
          code: 'NOT_FOUND',
          message: 'El registro no existe o no pertenece a esta tienda.',
        };
      } else if (exception.code === 'P2003') {
        status = HttpStatus.CONFLICT;
        body = {
          statusCode: status,
          code: 'RELATION_CONFLICT',
          message: 'La operación hace referencia a datos de otra tienda o inexistentes.',
        };
      } else {
        this.logger.error(`Prisma ${exception.code}: ${exception.message}`);
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (status >= 500 && process.env.NODE_ENV === 'production') {
      body = {
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Ocurrió un error inesperado. Intente nuevamente.',
      };
    }
    response.status(status).json({
      ...body,
      path: request.path,
      timestamp: new Date().toISOString(),
    });
  }
}
