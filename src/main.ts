import 'reflect-metadata';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

const IDLE_TIMEOUT_MS = (Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES) || 30) * 60_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Brak wymaganej zmiennej środowiskowej: ${name}`);
  }
  return value;
}

async function bootstrap(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind a reverse proxy (nginx/Caddy terminating TLS) so secure cookies
  // and req.ip are derived from X-Forwarded-* correctly.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          styleSrc: ["'self'"],
          scriptSrc: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  const sessionStore = new (connectPgSimple(session))({
    pool: new Pool({ connectionString: requireEnv('DATABASE_URL') }),
    tableName: 'session',
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 15,
  });

  app.use(
    session({
      store: sessionStore,
      secret: requireEnv('SESSION_SECRET'),
      name: 'portal.sid',
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: IDLE_TIMEOUT_MS,
      },
    }),
  );

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('ejs');
  app.useStaticAssets(join(__dirname, '..', 'public'));

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
}

bootstrap();
