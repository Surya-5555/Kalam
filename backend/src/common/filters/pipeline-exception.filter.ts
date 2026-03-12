import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorResponse } from '../api-error';

/**
 * Global exception filter.
 *
 * Converts every thrown exception into the standard ApiErrorResponse shape.
 * - HttpExceptions: status + errorCode preserved from the exception body.
 * - Non-HttpExceptions: 500 INTERNAL_ERROR (message hidden in production).
 *
 * Registration: app.useGlobalFilters(new PipelineExceptionFilter()) in main.ts
 */
@Catch()
export class PipelineExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PipelineExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode: string = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
        errorCode = this.statusToCode(status);
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;

        // Prefer explicit errorCode fields set by our own throw sites
        errorCode = (b.error as string | undefined) ?? this.statusToCode(status);
        message = Array.isArray(b.message)
          ? (b.message as string[]).join('; ')
          : (b.message as string | undefined) ?? message;

        // Forward any extra fields (e.g. inspectionResult) as details
        const { statusCode: _s, error: _e, message: _m, ...rest } = b;
        if (Object.keys(rest).length > 0) details = rest;
      }
    } else {
      const msg =
        exception instanceof Error ? exception.message : String(exception);
      this.logger.error(`Unhandled exception: ${msg}`, exception instanceof Error ? exception.stack : undefined);

      // Hide internal details in production
      if (process.env.NODE_ENV !== 'production') {
        message = msg;
      }
    }

    const payload: ApiErrorResponse = {
      success: false,
      errorCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(details !== undefined ? { details } : {}),
    };

    response.status(status).json(payload);
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE',
      429: 'RATE_LIMITED',
      500: 'INTERNAL_ERROR',
    };
    return map[status] ?? 'ERROR';
  }
}
