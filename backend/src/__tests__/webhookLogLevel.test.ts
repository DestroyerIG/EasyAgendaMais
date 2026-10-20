import { it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ default: log }));
vi.mock('../modules/whatsapp/webhook.handler.js', () => ({ handleWebhookEvent: vi.fn(async () => undefined) }));
vi.mock('../modules/whatsapp/whatsapp.controller.js', () => ({
  getStatus: vi.fn(), initialize: vi.fn(), getQrCode: vi.fn(), disconnect: vi.fn(), sendMessage: vi.fn(),
  syncWebhooks: vi.fn(), cleanupCorrupted: vi.fn(), testWebhookConfig: vi.fn(), internalHealth: vi.fn(),
}));
vi.mock('../middleware/auth.js', () => ({ authMiddleware: vi.fn() }));
vi.mock('../middleware/rbac.js', () => ({ requireAdmin: vi.fn(), requireTenantRoles: vi.fn() }));
vi.mock('../middleware/subscriptionGuard.js', () => ({ requireFeature: () => vi.fn() }));

const router = (await import('../modules/whatsapp/whatsapp.module.js')).default;
const app = express();
app.use(express.json());
app.use('/', router);

const recebida = (nivel: 'info' | 'debug') =>
  log[nivel].mock.calls.filter((c) => String(c[1]).startsWith('webhook-controller: requisição recebida'));

beforeEach(() => vi.clearAllMocks());

it('messages-update na rota global registra em debug', async () => {
  await request(app).post('/webhook').send({ event: 'MESSAGES_UPDATE', instance: 'x' });
  expect(recebida('debug')).toHaveLength(1);
  expect(recebida('info')).toHaveLength(0);
});

it('messages-update na rota por evento registra em debug', async () => {
  await request(app).post('/webhook/messages-update').send({ instance: 'x' });
  expect(recebida('debug')).toHaveLength(1);
  expect(recebida('info')).toHaveLength(0);
});

it('outros eventos seguem em info', async () => {
  await request(app).post('/webhook').send({ event: 'MESSAGES_UPSERT', instance: 'x' });
  await request(app).post('/webhook/messages-upsert').send({ instance: 'x' });
  expect(recebida('info')).toHaveLength(2);
  expect(recebida('debug')).toHaveLength(0);
});
