import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { RedirectException } from '../exceptions/redirect.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof RedirectException) {
      response.redirect(exception.redirectTo);
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Wystąpił nieoczekiwany błąd serwera.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string' ? body : ((body as { message?: string }).message ?? message);
    } else {
      this.logger.error('Unhandled exception', (exception as Error)?.stack ?? String(exception));
    }

    if (request.headers.accept?.includes('application/json')) {
      response.status(status).json({ statusCode: status, message });
      return;
    }

    response.status(status).render('error', {
      title: status === HttpStatus.NOT_FOUND ? 'Nie znaleziono' : 'Błąd',
      statusCode: status,
      message,
    });
  }
}
