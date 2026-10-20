import logger from '../../utils/logger.js';
import { canonicalizePhone, stripToDigits } from '../../services/whatsapp/utils/phoneUtils.js';
import { evolutionApi } from '../whatsapp/evolution-api.service.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { avatarRepository as repo } from './avatar.repository.js';

export const VALIDADE_FOTO_DIAS = 3;
export const NOVA_TENTATIVA_SEM_FOTO_DIAS = 7;
export const LOTE_POR_NEGOCIO = 10;

const DIA_MS = 86_400_000;
/** Teto de pendências por negócio na memória (o que passar volta a ser pedido na próxima listagem). */
const PENDENTES_MAX = 500;

// negócio -> (chave canônica -> telefone original usado na busca). Só em memória: se o
// processo reiniciar, a próxima listagem agenda de novo.
const pendentes = new Map<string, Map<string, string>>();

const agendar = (businessId: string, phoneKey: string, phone: string): void => {
  let fila = pendentes.get(businessId);
  if (!fila) { fila = new Map(); pendentes.set(businessId, fila); }
  if (fila.has(phoneKey) || fila.size >= PENDENTES_MAX) return;
  fila.set(phoneKey, phone);
};

/** Número para a Evolution: só dígitos, com o 55 na frente. */
const numeroEvolution = (phone: string): string => {
  const d = stripToDigits(phone);
  return d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
};

const precisaAtualizar = (url: string | null, fetchedAt: Date, agora: Date): boolean => {
  const idadeDias = (agora.getTime() - fetchedAt.getTime()) / DIA_MS;
  return idadeDias >= (url ? VALIDADE_FOTO_DIAS : NOVA_TENTATIVA_SEM_FOTO_DIAS);
};

export const avatares = {
  /**
   * Devolve o que há em cache (mesmo vencido) por chave canônica e agenda os faltantes/vencidos
   * para a rotina em segundo plano. Nunca lança: sem cache, tudo vem null.
   */
  async urlsPara(businessId: string, phones: string[], agora: Date = new Date()): Promise<Map<string, string | null>> {
    const originais = new Map<string, string>();
    for (const p of phones) {
      const key = canonicalizePhone(p);
      if (key && !originais.has(key)) originais.set(key, p);
    }
    const saida = new Map<string, string | null>();
    for (const key of originais.keys()) saida.set(key, null);
    if (originais.size === 0) return saida;

    let rows: Awaited<ReturnType<typeof repo.buscar>> = [];
    try {
      rows = await repo.buscar(businessId, [...originais.keys()]);
    } catch (err) {
      logger.warn({ err, businessId }, 'avatares: falha ao ler o cache');
      return saida;
    }
    const porChave = new Map(rows.map((r) => [r.phoneKey, r]));
    for (const [key, phone] of originais) {
      const row = porChave.get(key);
      if (row) saida.set(key, row.url ?? null);
      if (!row || precisaAtualizar(row.url ?? null, row.fetchedAt, agora)) agendar(businessId, key, phone);
    }
    return saida;
  },

  /** Até LOTE_POR_NEGOCIO fotos por negócio conectado a cada chamada (rotina por minuto). */
  async processar(agora: Date = new Date()): Promise<{ buscados: number }> {
    let buscados = 0;
    for (const [businessId, fila] of [...pendentes]) {
      if (fila.size === 0) { pendentes.delete(businessId); continue; }
      try {
        const conexao = await whatsappService.getStatus(businessId);
        if (conexao?.status !== 'connected' || !conexao.instanceName) {
          // Sem conexão: descarta as pendências (a próxima listagem agenda de novo).
          pendentes.delete(businessId);
          continue;
        }
        for (const [key, phone] of [...fila].slice(0, LOTE_POR_NEGOCIO)) {
          fila.delete(key);
          let url: string | null;
          try {
            url = await evolutionApi.fetchProfilePictureUrl(conexao.instanceName, numeroEvolution(phone));
          } catch (err) {
            // Falha da Evolution não grava nada: mantém url e buscado_em anteriores; volta a ser agendado na próxima listagem.
            logger.warn({ err, businessId }, 'avatares: Evolution falhou; nada gravado');
            continue;
          }
          try {
            await repo.gravar(businessId, key, url, agora);
          } catch (err) {
            logger.warn({ err, businessId }, 'avatares: falha ao gravar');
          }
          buscados++;
        }
        if (fila.size === 0) pendentes.delete(businessId);
      } catch (err) {
        logger.warn({ err, businessId }, 'avatares: negócio ignorado nesta rodada');
      }
    }
    return { buscados };
  },
};
