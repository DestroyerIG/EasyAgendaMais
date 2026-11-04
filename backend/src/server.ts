// OpenTelemetry must be imported before everything else
if (process.env.OTEL_ENABLED === 'true') {
  await import('./telemetry.js');
}

import express, {
  Request,
  Response,
  NextFunction,
} from 'express';

import cors, { CorsOptions } from 'cors';
import rateLimit, {
  ipKeyGenerator,
} from 'express-rate-limit';

import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

import { prisma } from './config/prisma.js';

import logger from './utils/logger.js';

import { errorHandler } from './middleware/errorHandler.js';

import { requestIdMiddleware } from './modules/core/middleware/requestId.js';

import { httpLoggerMiddleware } from './modules/core/middleware/httpLogger.js';

import { sanitizeMiddleware } from './modules/core/middleware/sanitize.js';

import { applySecurityMiddleware } from './modules/core/middleware/security.js';

// Route modules — new TS modules
import billingRoutes from './modules/billing/billing.routes.js';
import appointmentRoutes from './modules/appointments/appointments.routes.js';
import businessPublicPageRoutes from './modules/businessPublicPage/businessPublicPage.routes.js';
import publicBookingRoutes from './modules/publicBooking/publicBooking.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import productRoutes from './modules/products/products.routes.js';
import comandaRoutes from './modules/comandas/comandas.routes.js';
import cashRoutes from './modules/cash/cash.routes.js';
import reportsRoutes from './modules/reports/reports.routes.js';
import clubeRoutes from './modules/clube/clube.routes.js';
import equipeRoutes, { conviteRoutes } from './modules/equipe/equipe.routes.js';
import onboardingRoutes from './modules/onboarding/onboarding.routes.js';
import bancadaRoutes from './modules/bancada/bancada.routes.js';
import pushRoutes from './modules/push/push.routes.js';
import googleAgendaRoutes from './modules/googleAgenda/googleAgenda.routes.js';
import avaliacoesRoutes from './modules/avaliacoes/avaliacoes.routes.js';
import depoimentosRoutes from './modules/depoimentos/depoimentos.routes.js';
import depoimentosAdminRoutes from './modules/depoimentos/depoimentos.admin.routes.js';
import { authMiddleware } from './middleware/auth.js';
import { requireAdmin } from './middleware/rbac.js';
import contaRoutes from './modules/conta/conta.routes.js';

// Route modules — stub re-exports
// @ts-ignore
import authRoutes from './modules/auth/auth.routes.js';

// @ts-ignore
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';

// @ts-ignore
import clientRoutes from './modules/clients/clients.routes.js';
import crmRoutes from './modules/crm/crm.routes.js';
import clientPhotoRoutes from './modules/clientPhotos/clientPhotos.routes.js';
import tagRoutes from './modules/tags/tags.routes.js';
import waitlistRoutes from './modules/waitlist/waitlist.routes.js';

// @ts-ignore
import financeRoutes from './modules/finance/finance.routes.js';

// @ts-ignore
import businessRoutes from './modules/business/business.routes.js';

// @ts-ignore
import whatsappRoutes from './modules/whatsapp/whatsapp.routes.js';
import inboxRoutes from './modules/whatsappInbox/inbox.routes.js';
import retornoRoutes from './modules/whatsappRetorno/retorno.routes.js';
import automacoesRoutes from './modules/whatsappAutomacoes/automacoes.routes.js';
import campanhasRoutes from './modules/whatsappCampanhas/campanhas.routes.js';

// @ts-ignore

// @ts-ignore
import adminRoutes from './modules/admin/admin.routes.js';

// Legacy JS imports
// @ts-ignore

// @ts-ignore
import { initBotOrchestrator } from './bot/botOrchestrator.js';

// @ts-ignore
import { createEvolutionClient } from './services/whatsapp/client/evolutionClient.js';

import { startReminderCron } from './services/cronService.js';
import { whatsappService } from './modules/whatsapp/whatsapp.service.js';

// @ts-ignore
import { getAsaasApiKeyDiagnostics } from './integrations/asaas/client.js';

dotenv.config();

const requiredEnvVars = [
  'JWT_SECRET',
  'DATABASE_URL',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.fatal(
      `Variável de ambiente ${envVar} não definida!`
    );

    process.exit(1);
  }
}

if (
  process.env.ASAAS_BASE_URL &&
  !process.env.ASAAS_API_KEY
) {
  logger.fatal(
    'ASAAS_BASE_URL definido sem ASAAS_API_KEY'
  );

  process.exit(1);
}

if (process.env.ASAAS_API_KEY) {
  logger.info(
    {
      event: 'asaas_api_key_diagnostics',
      ...getAsaasApiKeyDiagnostics(),
    },
    'Diagnóstico da chave Asaas no boot'
  );
}

const app = express();

app.set('trust proxy', 1);

const PORT = Number(process.env.PORT || 5000);

const API_V1 = '/api/v1';

const API_JSON_BODY_LIMIT =
  process.env.API_JSON_BODY_LIMIT || '1mb';

const WHATSAPP_WEBHOOK_BODY_LIMIT =
  process.env.WHATSAPP_WEBHOOK_BODY_LIMIT || '6mb';

const BLOCKED_WHATSAPP_WEBHOOK_EVENTS =
  new Set([
    'messages-set',
    'messageset',
  ]);

const normalizeWebhookEventName = (
  value: string
): string =>
  String(value || '')
    .trim()
    .replace(
      /([a-z0-9])([A-Z])/g,
      '$1-$2'
    )
    .toLowerCase()
    .replace(/[._\s]+/g, '-')
    .replace(/-+/g, '-');

// SECURITY
applySecurityMiddleware(app);

// CORS
// O site abre com e sem "www": as duas formas do FRONTEND_URL valem.
const comEsemWww = (url: string | undefined): string[] => {
  if (!url) return [];
  try {
    const { protocol, host } = new URL(url);
    const outro = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
    return [`${protocol}//${host}`, `${protocol}//${outro}`];
  } catch {
    return [url];
  }
};

const allowedOrigins = [
  ...(process.env.NODE_ENV !== 'production'
    ? ['http://localhost:3000', 'http://127.0.0.1:3000']
    : []),
  ...comEsemWww(process.env.FRONTEND_URL),
];

const vercelProjectPrefix =
  process.env.VERCEL_PROJECT_PREFIX ||
  'barberpro-saas-2-0';

const isAllowedVercelPreview = (
  origin: string
): boolean => {
  try {
    const hostname = new URL(origin).hostname;

    if (!hostname.endsWith('.vercel.app')) {
      return false;
    }

    return (
      hostname ===
        `${vercelProjectPrefix}.vercel.app` ||
      hostname.startsWith(
        `${vercelProjectPrefix}-`
      )
    );
  } catch {
    return false;
  }
};

const corsOptions: CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (
      err: Error | null,
      allow?: boolean
    ) => void
  ) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    if (isAllowedVercelPreview(origin)) {
      return callback(null, true);
    }

    return callback(
      new Error(
        `Origin não permitida pelo CORS: ${origin}`
      )
    );
  },

  credentials: true,

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ],
};

app.use(cors(corsOptions));

app.use(cookieParser());

// BLOCK heavy WhatsApp events
app.post(
  `${API_V1}/whatsapp/webhook/:event`,
  (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const eventName =
      normalizeWebhookEventName(
        req.params['event'] ?? ''
      );

    if (
      !BLOCKED_WHATSAPP_WEBHOOK_EVENTS.has(
        eventName
      )
    ) {
      return next();
    }

    logger.info(
      {
        event: eventName,
        route: req.originalUrl,
        ignoredBeforeParser: true,
      },
      'Webhook WhatsApp pesado ignorado'
    );

    return res.status(200).json({
      success: true,
      data: {
        received: true,
        processed: false,
        ignored: true,
        reason: 'blocked_event',
        event: eventName,
      },
    });
  }
);

app.use(
  `${API_V1}/whatsapp/webhook`,
  express.json({
    limit: WHATSAPP_WEBHOOK_BODY_LIMIT,
  })
);

// Imagem em base64 (logo/galeria da página pública) infla ~33% sobre o arquivo
// original; limite maior só para esta rota, sem elevar o limite da API inteira.
app.use(
  `${API_V1}/business-public-page/upload-image`,
  express.json({
    limit: '6mb',
  })
);

// Foto de procedimento (até 5MB) em base64: limite maior só para esta rota.
app.use(
  `${API_V1}/clients/:id/photos`,
  express.json({
    limit: '7mb',
  })
);
app.use(
  `${API_V1}/bancada/clientes/:id/fotos`,
  express.json({
    limit: '7mb',
  })
);

app.use(
  express.json({
    limit: API_JSON_BODY_LIMIT,
  })
);

// Middlewares
app.use(requestIdMiddleware);

app.use(httpLoggerMiddleware);

app.use(sanitizeMiddleware);

// GLOBAL RATE LIMIT
const webhookPaths = [
  `${API_V1}/billing/webhooks/asaas`,
  `${API_V1}/billing/webhook/asaas`,
  `${API_V1}/whatsapp/webhook`,
];

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 300,

  standardHeaders: true,

  legacyHeaders: false,

  keyGenerator: (req: Request) => {
    const user = (
      req as Request & {
        user?: {
          businessId?: string;
        };
      }
    ).user;

    if (user?.businessId) {
      return `tenant:${user.businessId}`;
    }

    return ipKeyGenerator(req.ip || 'unknown');
  },

  skip: (req: Request) =>
    req.method === 'OPTIONS' ||
    webhookPaths.some((p) =>
      req.originalUrl.startsWith(p)
    ),

  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message:
        'Muitas requisições. Tente novamente em alguns minutos.',
    },
  },
});

app.use(API_V1, apiLimiter);

// HEALTH
app.get(
  '/health',
  async (
    _req: Request,
    res: Response
  ) => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      return res.json({
        status: 'ok',
        db: 'connected',
        uptime: process.uptime(),
      });
    } catch {
      return res.status(503).json({
        status: 'error',
        db: 'disconnected',
      });
    }
  }
);

// ROUTES
app.use(`${API_V1}/auth`, authRoutes);

app.use(
  `${API_V1}/dashboard`,
  dashboardRoutes
);

app.use(
  `${API_V1}/appointments`,
  appointmentRoutes
);

app.use(
  `${API_V1}/business-public-page`,
  businessPublicPageRoutes
);

app.use(
  `${API_V1}/public`,
  publicBookingRoutes
);

app.use(
  `${API_V1}/notifications`,
  notificationRoutes
);

app.use(`${API_V1}/products`, productRoutes);
app.use(`${API_V1}/comandas`, comandaRoutes);
app.use(`${API_V1}/cash`, cashRoutes);
app.use(`${API_V1}/reports`, reportsRoutes);
app.use(`${API_V1}/clube`, clubeRoutes);
app.use(`${API_V1}/equipe`, equipeRoutes);
app.use(`${API_V1}/onboarding`, onboardingRoutes);
app.use(`${API_V1}/convites`, conviteRoutes);
app.use(`${API_V1}/bancada`, bancadaRoutes);
app.use(`${API_V1}/push`, pushRoutes);
app.use(`${API_V1}/google-agenda`, googleAgendaRoutes);
app.use(`${API_V1}/avaliacoes`, avaliacoesRoutes);
app.use(`${API_V1}/depoimentos`, depoimentosRoutes);
app.use(`${API_V1}/admin/depoimentos`, authMiddleware, requireAdmin, depoimentosAdminRoutes);
app.use(`${API_V1}/conta`, contaRoutes);

app.use(`${API_V1}/clients`, crmRoutes);
app.use(`${API_V1}/clients`, clientPhotoRoutes);
app.use(`${API_V1}/tags`, tagRoutes);
app.use(`${API_V1}/waitlist`, waitlistRoutes);
app.use(
  `${API_V1}/clients`,
  clientRoutes
);

app.use(
  `${API_V1}/finance`,
  financeRoutes
);

app.use(
  `${API_V1}/business`,
  businessRoutes
);

app.use(
  `${API_V1}/whatsapp/retorno`,
  retornoRoutes
);

app.use(
  `${API_V1}/whatsapp/automacoes`,
  automacoesRoutes
);

app.use(
  `${API_V1}/whatsapp/campanhas`,
  campanhasRoutes
);

app.use(
  `${API_V1}/whatsapp`,
  inboxRoutes
);

app.use(
  `${API_V1}/whatsapp`,
  whatsappRoutes
);

app.use(
  `${API_V1}/billing`,
  billingRoutes
);

app.use(
  `${API_V1}/admin`,
  adminRoutes
);

app.get(
  '/',
  (
    _req: Request,
    res: Response
  ) => {
    return res.json({
      message:
        'EasyAgenda+ SaaS API',
      version: '1.0.0',
      status: 'online',
      port: PORT,
    });
  }
);

// 404
app.use(
  (
    _req: Request,
    res: Response
  ) => {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message:
          'Rota não encontrada',
      },
    });
  }
);

// ERROR HANDLER
app.use(errorHandler);

// GRACEFUL SHUTDOWN
let server:
  | ReturnType<typeof app.listen>
  | undefined;

const gracefulShutdown = async (
  signal: string
): Promise<void> => {
  logger.info(
    { signal },
    'Sinal de shutdown recebido'
  );

  if (server) {
    server.close(() => {
      logger.info(
        'Servidor HTTP encerrado'
      );
    });
  }

  try {
    await prisma.$disconnect();

    logger.info(
      'Prisma desconectado'
    );
  } catch (err) {
    logger.error(
      { err },
      'Erro ao desconectar Prisma'
    );
  }

  process.exit(0);
};

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

process.on(
  'unhandledRejection',
  (reason) => {
    logger.fatal(
      { err: reason },
      'Unhandled Rejection'
    );

    process.exit(1);
  }
);

// START SERVER
const start = async (): Promise<void> => {
  try {
    // NÃO usar prisma.$connect()
    // evita problema prepared statement no PgBouncer

    await prisma.$queryRaw`SELECT 1`;

    logger.info(
      'Conexão com banco de dados verificada'
    );

    try {
      initBotOrchestrator(
        createEvolutionClient()
      );

      logger.info(
        'botOrchestrator inicializado'
      );
    } catch (err) {
      logger.warn(
        {
          err: (err as Error)?.message,
        },
        'EvolutionClient não inicializado'
      );
    }

    server = app.listen(
      PORT,
      '0.0.0.0',
      () => {
        logger.info(
          `Servidor rodando na porta ${PORT}`
        );
      }
    );

    // DISABLE_CRON=true desliga lembretes e expirações (uso local apontando para o banco real).
    if (process.env['DISABLE_CRON'] === 'true') {
      logger.warn('Cron desligado por DISABLE_CRON=true');
    } else {
      startReminderCron();
      void whatsappService.syncAllWebhooks()
        .then((r) => logger.info({ fixed: r.fixed, failed: r.failed }, 'Webhooks do WhatsApp conferidos na subida'))
        .catch((err) => logger.warn({ err }, 'Falha ao conferir webhooks do WhatsApp na subida'));
    }
  } catch (error) {
    logger.fatal(
      { err: error },
      'Falha ao iniciar servidor'
    );

    process.exit(1);
  }
};

void start();