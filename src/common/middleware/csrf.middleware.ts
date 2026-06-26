import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Synchronizer-token CSRF protection. A token is minted once per session and
 * exposed to every rendered view as `csrfToken`; every state-changing form
 * must echo it back as a hidden field named `_csrf`.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (!req.session.csrfToken) {
      req.session.csrfToken = randomBytes(32).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;

    if (MUTATING_METHODS.has(req.method)) {
      const submitted = (req.body as Record<string, unknown> | undefined)?._csrf;
      const expected = req.session.csrfToken;
      if (
        typeof submitted !== 'string' ||
        submitted.length !== expected.length ||
        !timingSafeEqual(Buffer.from(submitted), Buffer.from(expected))
      ) {
        throw new ForbiddenException('Nieprawidłowy token CSRF. Odśwież stronę i spróbuj ponownie.');
      }
    }

    next();
  }
}
