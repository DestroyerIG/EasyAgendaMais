import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Application, Request } from 'express';

export function applySecurityMiddleware(app: Application): void {
  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      hsts: {
        maxAge: 63072000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
      },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      crossOriginEmbedderPolicy: false,
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    })
  );

  // Rate limit por tenant/IP
  app.use(
    '/api/v1',
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,

      keyGenerator: (req: Request): string => {
        const user = (
          req as Request & {
            user?: { businessId?: string };
          }
        ).user;

        // Prioriza tenant
        if (user?.businessId) {
          return `tenant:${user.businessId}`;
        }

        // Fallback seguro IPv4/IPv6
        return ipKeyGenerator(req.ip ?? 'unknown');
      },

      // Caminho (sem query string) com segmento "webhook"/"webhooks": uma query com "/webhook" não escapa do limite.
      skip: (req: Request): boolean =>
        req.method === 'OPTIONS' ||
        /\/webhooks?(\/|$)/.test(req.originalUrl.split('?')[0] ?? ''),

      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_TENANT',
          message: 'Limite de requisições excedido.',
        },
      },
    })
  );
}