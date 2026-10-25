/**
 * Setup global para testes — mocka dependencias externas (DB, WhatsApp, cron).
 */

import { vi } from 'vitest';

// Mock do pool de banco de dados
export const mockPool = {
  query: vi.fn(),
  end: vi.fn(),
  connect: vi.fn(),
};

// Mock do logger (silenciar logs durante testes)
export const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
};

// Push só funciona com as chaves VAPID. Sem elas o envio sai antes de consultar o banco,
// então nenhum teste que passa por `notify` toca o banco real. Vazio (e não apagado): o dotenv
// não sobrescreve variável que já existe, então as chaves do .env não voltam.
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';
process.env.VAPID_SUBJECT = '';
