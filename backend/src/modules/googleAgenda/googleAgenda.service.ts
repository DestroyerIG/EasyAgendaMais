import logger from '../../utils/logger.js';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { pushService } from '../push/push.service.js';
import { googleApi } from './googleAgenda.api.js';
import { cifrar, decifrar, googleConfigurado } from './googleAgenda.crypto.js';
import { googleAgendaRepository as repo } from './googleAgenda.repository.js';
import { assinarState, conexaoEfetiva, lerState, type Para } from './googleAgenda.rules.js';
import type { UsuarioLogado } from './googleAgenda.types.js';

// Google Agenda (fase 7): a dona conecta a agenda do negócio, cada profissional conecta a dela.

const frontend = () => (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const telaDe = (para: Para) => (para === 'profissional' ? '/bancada' : '/configuracoes');

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

  /** Volta do Google: devolve para onde redirecionar o navegador. Nunca lança. */
  async callback(code: string | undefined, state: string | undefined): Promise<string> {
    const lido = state ? lerState(state) : null;
    const para: Para = lido?.para ?? 'negocio';
    const erro = `${frontend()}${telaDe(para)}?google=erro`;
    if (!lido || !code || !googleConfigurado()) return erro;

    try {
      const u = await repo.usuario(lido.userId);
      if (!u) return erro;
      if (para === 'negocio' && u.role !== 'tenant_admin') return erro;
      if (para === 'profissional' && !u.professionalId) return erro;

      const { refreshToken, email } = await googleApi.trocarCodigo(code);
      const token = await googleApi.accessToken(refreshToken);
      const { timezone } = await getBusinessScheduleSettings(u.businessId);
      const nome = para === 'negocio' ? `EasyAgenda+ · ${u.business.name}` : 'EasyAgenda+';
      const calendarioId = await googleApi.criarAgenda(token, nome, timezone);

      // A dona que atende sozinha já é a única profissional da grade.
      let professionalId = para === 'profissional' ? u.professionalId : null;
      if (para === 'negocio') {
        const ativas = await repo.profissionaisAtivos(u.businessId);
        professionalId = ativas.length === 1 ? ativas[0].id : null;
      }

      const conexao = await repo.salvarConexao({
        businessId: u.businessId, userId: u.id, tipo: para, professionalId,
        googleEmail: email, refreshTokenCifrado: cifrar(refreshToken), calendarioId,
      });
      void googleAgendaService.sincronizarSaida({ conexaoId: conexao.id });
      void googleAgendaService.atualizarOcupado(conexao.id);
      return `${frontend()}${telaDe(para)}?google=ok`;
    } catch (e) {
      logger.warn({ err: e, userId: lido.userId }, 'Google Agenda: falha ao conectar');
      return erro;
    }
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

  /** Agendamentos para o Google (Task 5). */
  async sincronizarSaida(_opts: { appointmentId?: string; conexaoId?: string } = {}): Promise<void> {
    void _opts;
  },

  /** Ocupado do Google (Task 6). */
  async atualizarOcupado(_conexaoId?: string): Promise<void> {
    void _conexaoId;
  },
};
