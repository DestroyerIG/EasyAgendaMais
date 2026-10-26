import { randomBytes } from 'node:crypto';
import logger from '../../utils/logger.js';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { pushService } from '../push/push.service.js';
import { GoogleIndisponivel, GoogleNaoEncontrado, GoogleTokenInvalido, eventoIdDe, googleApi } from './googleAgenda.api.js';
import { cifrar, decifrar, googleConfigurado } from './googleAgenda.crypto.js';
import { googleAgendaRepository as repo } from './googleAgenda.repository.js';
import {
  assinarState, conexaoEfetiva, conexoesQueVeem, deveTerEvento, faixasDoDia, lerState, montarEvento,
  type AgendamentoSync, type ConexaoSync, type Para,
} from './googleAgenda.rules.js';
import type { UsuarioLogado } from './googleAgenda.types.js';

// Google Agenda (fase 7): a dona conecta a agenda do negócio, cada profissional conecta a dela.

const frontend = () => (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const telaDe = (para: Para) => (para === 'profissional' ? '/bancada' : '/configuracoes');

const DIA_MS = 24 * 60 * 60 * 1000;

// Conexões que voltaram do Google e esperam a confirmação do navegador logado (uma instância só).
const VALIDADE_PENDENTE_MS = 10 * 60 * 1000;
const pendentes = new Map<string, { userId: string; para: Para; refreshToken: string; email: string; exp: number }>();
function limparPendentes() {
  const agora = Date.now();
  for (const [t, p] of pendentes) if (p.exp < agora) pendentes.delete(t);
}

type ConexaoComToken = ConexaoSync & { calendarioId: string; refreshTokenCifrado: string };

/** O Google recusou o token: a conexão vai para "reconectar" e avisa uma vez (na troca de status). */
async function marcarReconectar(c: ConexaoComToken, e: unknown) {
  await repo.atualizarConexao(c.id, { status: 'reconectar', ultimoErro: (e as Error).message?.slice(0, 255) ?? null });
  await googleAgendaService.avisarReconectar(c);
}

// Uma sincronização por conexão de cada vez: o cron e a sincronização imediata não disputam o mesmo evento.
const emSincronizacao = new Set<string>();

const mensagem = (e: unknown) => ((e as Error)?.message ?? String(e)).slice(0, 255);

async function sincronizarConexao(c: ConexaoComToken, agendamentos: AgendamentoSync[], fuso: string) {
  if (conexaoEfetiva(c, c.business.plan) !== 'ativa' || emSincronizacao.has(c.id)) return;
  emSincronizacao.add(c.id);
  try {
    const eventos = new Map((await repo.eventosDaConexao(c.id)).map((ev) => [ev.appointmentId, ev]));
    let token: string | null = null;
    const acesso = async () => (token ??= await googleApi.accessToken(decifrar(c.refreshTokenCifrado)));
    const ctx = { fuso, frontendUrl: frontend() };
    let falha: string | null = null;

    for (const ag of agendamentos) {
      const ev = eventos.get(ag.id);
      const deve = deveTerEvento(ag.status) && conexoesQueVeem(ag, [c]).length > 0;
      try {
        if (deve && (!ev || ev.versao.getTime() !== ag.updatedAt.getTime())) {
          const id = await googleApi.gravarEvento(
            await acesso(), c.calendarioId, ev?.googleEventId ?? eventoIdDe(ag.id), montarEvento(ag, c.tipo, ctx),
          );
          await repo.salvarEvento({ conexaoId: c.id, appointmentId: ag.id, googleEventId: id, versao: ag.updatedAt });
        } else if (!deve && ev) {
          await googleApi.apagarEvento(await acesso(), c.calendarioId, ev.googleEventId);
          await repo.apagarEvento(c.id, ag.id);
        }
      } catch (e) {
        // Token recusado, agenda apagada ou limite do Google valem para a conexão toda.
        if (e instanceof GoogleTokenInvalido || e instanceof GoogleNaoEncontrado || e instanceof GoogleIndisponivel) throw e;
        falha = mensagem(e);
        logger.warn({ err: e, conexaoId: c.id, appointmentId: ag.id }, 'Google Agenda: falha num evento');
      }
    }
    await repo.atualizarConexao(c.id, { ultimaSyncEm: new Date(), ultimoErro: falha });
  } catch (e) {
    if (e instanceof GoogleTokenInvalido) return marcarReconectar(c, e);
    if (e instanceof GoogleNaoEncontrado) return marcarReconectar(c, new Error('A agenda EasyAgenda+ foi apagada no Google'));
    logger.warn({ err: e, conexaoId: c.id }, 'Google Agenda: falha ao sincronizar a conexão');
  } finally {
    emSincronizacao.delete(c.id);
  }
}

export const googleAgendaService = {
  conectarUrl(user: UsuarioLogado, para: Para): { url: string } {
    if (!googleConfigurado()) throw new NotFoundError('Google Agenda');
    if (para === 'negocio' && user.role !== 'tenant_admin') throw new ForbiddenError('Só a dona conecta a agenda do negócio');
    if (para === 'profissional' && user.role !== 'professional') throw new ForbiddenError('Conecte pelo app da profissional');
    if (para === 'profissional' && conexaoEfetiva({ tipo: 'profissional', status: 'ativa' }, user.plan) === 'pausada_plano') {
      throw new ForbiddenError('O app da profissional faz parte dos planos Equipe e Salão');
    }
    return { url: googleApi.urlConsentimento(assinarState(user.userId, para)) };
  },

  /**
   * Volta do Google: troca o código e deixa a conexão pendente por 10 minutos. Quem confirma é o
   * navegador logado (POST /confirmar), e só se for a mesma pessoa que pediu: um link de conexão
   * gerado por outra conta não liga a agenda de ninguém. Devolve para onde redirecionar. Nunca lança.
   */
  async callback(code: string | undefined, state: string | undefined): Promise<string> {
    const lido = state ? lerState(state) : null;
    const para: Para = lido?.para ?? 'negocio';
    const tela = `${frontend()}${telaDe(para)}`;
    if (!lido || !code || !googleConfigurado()) return `${tela}?google=erro`;
    try {
      const { refreshToken, email } = await googleApi.trocarCodigo(code);
      limparPendentes();
      const t = randomBytes(24).toString('base64url');
      pendentes.set(t, { userId: lido.userId, para, refreshToken, email, exp: Date.now() + VALIDADE_PENDENTE_MS });
      return `${tela}?google=confirmar&t=${t}`;
    } catch (e) {
      logger.warn({ err: e, userId: lido.userId }, 'Google Agenda: falha ao trocar o código');
      return `${tela}?google=erro`;
    }
  },

  async confirmar(user: UsuarioLogado, t: string) {
    const p = pendentes.get(t);
    pendentes.delete(t);
    if (!p || p.exp < Date.now()) throw new NotFoundError('Conexão pendente com o Google Agenda');
    if (p.userId !== user.userId) {
      void Promise.resolve().then(() => googleApi.revogar(p.refreshToken)).catch(() => undefined);
      throw new ForbiddenError('Esta conexão foi pedida por outra conta. Conecte de novo por aqui.');
    }

    const u = await repo.usuario(user.userId);
    if (!u) throw new NotFoundError('Usuário');
    if (p.para === 'negocio' && u.role !== 'tenant_admin') throw new ForbiddenError('Só a dona conecta a agenda do negócio');
    if (p.para === 'profissional' && !u.professionalId) throw new ForbiddenError('Conecte pelo app da profissional');

    const token = await googleApi.accessToken(p.refreshToken);
    const anterior = await repo.conexaoDoUsuario(u.id);
    // Reconectar a mesma conta Google reaproveita a agenda: os eventos têm id fixo e são reencontrados.
    let calendarioId = anterior && anterior.googleEmail === p.email && await googleApi.agendaExiste(token, anterior.calendarioId)
      ? anterior.calendarioId
      : null;
    if (!calendarioId) {
      const { timezone } = await getBusinessScheduleSettings(u.businessId);
      const nome = p.para === 'negocio' ? `EasyAgenda+ · ${u.business.name}` : 'EasyAgenda+';
      calendarioId = await googleApi.criarAgenda(token, nome, timezone);
    }

    let professionalId = p.para === 'profissional' ? u.professionalId : null;
    if (p.para === 'negocio') {
      if (anterior?.tipo === 'negocio') {
        professionalId = anterior.professionalId;
      } else {
        // A dona que atende sozinha já é a única profissional da grade.
        const ativas = await repo.profissionaisAtivos(u.businessId);
        professionalId = ativas.length === 1 ? ativas[0].id : null;
      }
    }

    const conexao = await repo.salvarConexao({
      businessId: u.businessId, userId: u.id, tipo: p.para, professionalId,
      googleEmail: p.email, refreshTokenCifrado: cifrar(p.refreshToken), calendarioId,
    });
    void googleAgendaService.sincronizarSaida({ conexaoId: conexao.id });
    void googleAgendaService.atualizarOcupado(conexao.id);
    return googleAgendaService.minhaConexao(user);
  },

  async minhaConexao(user: UsuarioLogado) {
    if (!googleConfigurado()) return { configurado: false, conexao: null };
    const c = await repo.conexaoDoUsuario(user.userId);
    const conexao = c ? {
      tipo: c.tipo, googleEmail: c.googleEmail, status: conexaoEfetiva(c, user.plan),
      ultimaSyncEm: c.ultimaSyncEm, professionalId: c.professionalId,
    } : null;
    if (user.role !== 'tenant_admin') return { configurado: true, conexao };

    const [ativas, conexoes] = await Promise.all([repo.profissionaisAtivos(user.businessId), repo.conexoesDoNegocio(user.businessId)]);
    const daProfissional = new Map(conexoes.filter((x) => x.tipo === 'profissional').map((x) => [x.professionalId, x]));
    const profissionais = ativas.map((p) => {
      const cp = daProfissional.get(p.id);
      return { professionalId: p.id, nome: p.name, status: cp ? conexaoEfetiva(cp, user.plan) : null };
    });
    return { configurado: true, conexao, profissionais };
  },

  /** A dona diz quem ela é na grade (ou que não atende). */
  async definirProfissional(user: UsuarioLogado, professionalId: string | null) {
    const c = await repo.conexaoDoUsuario(user.userId);
    if (!c || c.tipo !== 'negocio') throw new NotFoundError('Conexão com o Google Agenda');
    if (professionalId && !(await repo.profissionalDoNegocio(user.businessId, professionalId))) {
      throw new NotFoundError('Profissional');
    }
    await repo.atualizarConexao(c.id, { professionalId });
    void googleAgendaService.atualizarOcupado(c.id);
    return googleAgendaService.minhaConexao(user);
  },

  /** Revoga no Google (se der) e apaga; a agenda "EasyAgenda+" fica no Google dela. */
  async desconectar(user: UsuarioLogado) {
    const c = await repo.conexaoDoUsuario(user.userId);
    if (!c) throw new NotFoundError('Conexão com o Google Agenda');
    try {
      await googleApi.revogar(decifrar(c.refreshTokenCifrado));
    } catch (e) {
      logger.warn({ err: e, conexaoId: c.id }, 'Google Agenda: falha ao revogar; apagando assim mesmo');
    }
    await repo.apagarConexao(c.id);
    return { desconectado: true };
  },

  /** O Google recusou o token: a dona vê no sino (que já vai por push); a profissional recebe push. */
  async avisarReconectar(c: { id: string; businessId: string; tipo: string; professionalId: string | null }) {
    const titulo = 'Reconecte o Google Agenda';
    const corpo = 'O Google recusou o acesso e os agendamentos pararam de ir para a agenda.';
    if (c.tipo === 'negocio') {
      await notificationsService.notify(c.businessId, { type: 'google_agenda', title: titulo, description: corpo, link: '/configuracoes' });
    } else if (c.professionalId) {
      await pushService.paraProfissional(c.businessId, c.professionalId, { titulo, corpo, link: '/bancada', tag: 'google_agenda' });
    }
  },

  /**
   * Agendamentos para o Google: cria, atualiza (pela versão = updated_at) e apaga eventos de ontem a
   * +90 dias. Roda no cron a cada minuto e na hora depois de gravar um agendamento. Nunca lança.
   */
  async sincronizarSaida(opts: { appointmentId?: string; conexaoId?: string } = {}): Promise<void> {
    if (!googleConfigurado()) return;
    try {
      let filtro: { id?: string; businessId?: string } = opts.conexaoId ? { id: opts.conexaoId } : {};
      if (opts.appointmentId) {
        const ag = await repo.agendamentoPorId(opts.appointmentId);
        if (!ag) return;
        filtro = { businessId: ag.businessId };
      }
      const conexoes = await repo.conexoesAtivas(filtro);
      const porNegocio = new Map<string, typeof conexoes>();
      for (const c of conexoes) porNegocio.set(c.businessId, [...(porNegocio.get(c.businessId) ?? []), c]);

      const hoje = new Date();
      for (const [businessId, doNegocio] of porNegocio) {
        // Também os já sincronizados que mudaram fora da janela (remarcados para longe ou para trás).
        const agendamentos = await repo.agendamentosDaJanela(businessId, {
          de: new Date(hoje.getTime() - DIA_MS), ate: new Date(hoje.getTime() + 90 * DIA_MS),
          appointmentId: opts.appointmentId, conexaoIds: doNegocio.map((c) => c.id),
        });
        const { timezone } = await getBusinessScheduleSettings(businessId);
        for (const c of doNegocio) await sincronizarConexao(c, agendamentos, timezone);
      }
    } catch (e) {
      logger.warn({ err: e }, 'Google Agenda: falha na sincronização de saída');
    }
  },

  /** Lê o ocupado da agenda principal (agora a +60 dias) e substitui o guardado. Nunca lança. */
  async atualizarOcupado(conexaoId?: string): Promise<void> {
    if (!googleConfigurado()) return;
    try {
      const conexoes = await repo.conexoesAtivas(conexaoId ? { id: conexaoId } : {});
      for (const c of conexoes) {
        if (!c.professionalId || conexaoEfetiva(c, c.business.plan) !== 'ativa') {
          await repo.substituirOcupado(c.id, []);
          continue;
        }
        try {
          const token = await googleApi.accessToken(decifrar(c.refreshTokenCifrado));
          const agora = new Date();
          const ocupados = await googleApi.ocupado(token, agora, new Date(agora.getTime() + 60 * DIA_MS));
          await repo.substituirOcupado(c.id, ocupados);
        } catch (e) {
          if (e instanceof GoogleTokenInvalido) {
            await repo.substituirOcupado(c.id, []);
            await marcarReconectar(c, e);
          } else {
            logger.warn({ err: e, conexaoId: c.id }, 'Google Agenda: falha ao ler o ocupado');
          }
        }
      }
    } catch (e) {
      logger.warn({ err: e }, 'Google Agenda: falha ao atualizar o ocupado');
    }
  },

  /** Faixas do Google que bloqueiam a profissional no dia (vazio sem conexão ativa). */
  async bloqueiosDoDia(businessId: string, professionalId: string, data: string): Promise<Array<{ start: string; end: string }>> {
    const porProfissional = await googleAgendaService.ocupadoDoDia(businessId, data);
    return porProfissional[professionalId] ?? [];
  },

  /** Ocupado do dia por profissional, para a disponibilidade e a agenda do painel. */
  async ocupadoDoDia(businessId: string, data: string): Promise<Record<string, Array<{ start: string; end: string }>>> {
    if (!googleConfigurado()) return {};
    try {
      // Janela folgada em UTC; faixasDoDia recorta no fuso do negócio.
      const meiaNoite = new Date(`${data}T00:00:00Z`).getTime();
      const ocupados = await repo.ocupadosDoNegocio(businessId, new Date(meiaNoite - DIA_MS), new Date(meiaNoite + 2 * DIA_MS));
      const { timezone } = await getBusinessScheduleSettings(businessId);
      const porProfissional = new Map<string, Array<{ inicio: Date; fim: Date }>>();
      for (const o of ocupados) {
        const id = o.conexao.professionalId;
        if (!id || conexaoEfetiva(o.conexao, o.conexao.business.plan) !== 'ativa') continue;
        porProfissional.set(id, [...(porProfissional.get(id) ?? []), o]);
      }
      const resultado: Record<string, Array<{ start: string; end: string }>> = {};
      for (const [id, lista] of porProfissional) {
        const faixas = faixasDoDia(lista, data, timezone);
        if (faixas.length) resultado[id] = faixas;
      }
      return resultado;
    } catch (e) {
      logger.warn({ err: e, businessId }, 'Google Agenda: falha ao ler o ocupado do dia');
      return {};
    }
  },
};
