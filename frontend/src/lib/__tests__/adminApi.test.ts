import { afterEach, describe, expect, it } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import api from '@/lib/api';
import { adminApi } from '@/lib/adminApi';

const adaptador = (data: unknown, pedidos: InternalAxiosRequestConfig[] = []): AxiosAdapter => (config) => {
  pedidos.push(config);
  return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config });
};

describe('adminApi', () => {
  const original = api.defaults.adapter;
  afterEach(() => {
    api.defaults.adapter = original;
  });

  it('getTenants devolve data, meta, cartões e segmentos do envelope', async () => {
    const pedidos: InternalAxiosRequestConfig[] = [];
    const meta = { total: 1, page: 2, limit: 6, totalPages: 1 };
    const cartoes = { base: 1, pagantes: 0 };
    const segmentos = [{ segmento: 'unhas', total: 1 }];
    api.defaults.adapter = adaptador({ success: true, data: [{ id: 'n1' }], meta, cartoes, segmentos }, pedidos);

    const lista = await adminApi.getTenants({ status: 'carencia', busca: '', page: 2, limit: 6 });

    expect(lista).toEqual({ data: [{ id: 'n1' }], meta, cartoes, segmentos });
    // Filtro vazio não vai na query.
    expect(pedidos[0].params).toEqual({ status: 'carencia', page: 2, limit: 6 });
  });

  it('extendTrial manda a confirmação, os dias e o motivo', async () => {
    const pedidos: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = adaptador({ success: true, data: { tenantId: 't1', fimDoTeste: '2026-11-10T00:00:00.000Z' } }, pedidos);

    const r = await adminApi.extendTrial('t1', 5, 'motivo ok');

    expect(r.fimDoTeste).toBe('2026-11-10T00:00:00.000Z');
    expect(pedidos[0].url).toBe('/admin/tenants/t1/trial');
    expect(JSON.parse(pedidos[0].data as string)).toEqual({ confirmation: 'CONFIRM', dias: 5, reason: 'motivo ok' });
  });

  it('exportTenantAuditCsv pede o arquivo como blob, com a categoria', async () => {
    const pedidos: InternalAxiosRequestConfig[] = [];
    const arquivo = new Blob(['a;b']);
    api.defaults.adapter = adaptador(arquivo, pedidos);

    const blob = await adminApi.exportTenantAuditCsv('t1', 'financeiro');

    expect(blob).toBe(arquivo);
    expect(pedidos[0].responseType).toBe('blob');
    expect(pedidos[0].url).toBe('/admin/tenants/t1/auditoria.csv');
    expect(pedidos[0].params).toEqual({ categoria: 'financeiro' });
  });

  it('listarDepoimentos lê itens e publicados do envelope desembrulhado', async () => {
    const pedidos: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = adaptador({ success: true, data: [{ id: 'd1' }], meta: { publicados: 2 } }, pedidos);

    const lista = await adminApi.listarDepoimentos('publicados');

    expect(lista).toEqual({ data: [{ id: 'd1' }], publicados: 2 });
    expect(pedidos[0].params).toEqual({ aba: 'publicados' });
  });
});
