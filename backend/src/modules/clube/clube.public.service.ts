import { prisma } from '../../config/prisma.js';
import logger from '../../utils/logger.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { evaluateFeatureAccess } from '../../services/featureAccessService.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { publicBookingRepository } from '../publicBooking/publicBooking.repository.js';
import { clubeRepository as repo } from './clube.repository.js';
import { criarContrato, enviarCobranca, gerarPix, paraOfertaDto } from './clube.service.js';
import type { AdesaoInput } from './clube.types.js';

// Adesão pública ao clube (/agendar/[slug]/clube/[ofertaId]).

async function negocioDoSlug(slug: string) {
  const b = await prisma.business.findFirst({
    where: { slug, active: true },
    select: { id: true, name: true, slug: true, logoUrl: true, brandColor: true, pixKey: true, pixKeyType: true, plan: true, subscriptionStatus: true },
  });
  if (!b) throw new NotFoundError('Negócio');
  return b;
}

// A vitrine só existe no plano Salão em dia e com chave Pix (a mensalidade é paga por Pix).
const vitrineLiberada = (b: Awaited<ReturnType<typeof negocioDoSlug>>) =>
  !!b.pixKey && evaluateFeatureAccess({ feature: 'clube', plan: b.plan, subscriptionStatus: b.subscriptionStatus }).allowed;

const publica = (o: ReturnType<typeof paraOfertaDto>) => ({
  id: o.id, nome: o.nome, descricao: o.descricao, preco: o.preco, servicos: o.servicos.map((s) => s.nome),
  beneficios: o.beneficios, sessoesPorCiclo: o.sessoesPorCiclo, intervaloMinimoDias: o.intervaloMinimoDias,
  descontoExtrasPct: o.descontoExtrasPct, valorSessao: o.valorSessao,
});

export const clubePublicService = {
  async vitrine(slug: string) {
    const b = await negocioDoSlug(slug);
    const negocio = { nome: b.name, slug: b.slug, logoUrl: b.logoUrl, brandColor: b.brandColor };
    if (!vitrineLiberada(b)) return { negocio, ofertas: [] };
    const ofertas = await repo.listarOfertas(b.id, { publicas: true });
    return { negocio, ofertas: ofertas.map((o) => publica(paraOfertaDto(o))) };
  },

  async oferta(slug: string, ofertaId: string) {
    const b = await negocioDoSlug(slug);
    if (!vitrineLiberada(b)) throw new NotFoundError('Clube');
    const o = await repo.buscarOferta(b.id, ofertaId);
    if (!o || o.tipo !== 'clube' || !o.publica || o.status !== 'ativa') throw new NotFoundError('Clube');
    return { negocio: { nome: b.name, slug: b.slug, logoUrl: b.logoUrl, brandColor: b.brandColor }, oferta: publica(paraOfertaDto(o)) };
  },

  /**
   * Cria o contrato aguardando o primeiro Pix. Uma adesão pendente por telefone e oferta:
   * a segunda tentativa devolve a mesma cobrança.
   */
  async aderir(slug: string, ofertaId: string, input: AdesaoInput) {
    const b = await negocioDoSlug(slug);
    if (!vitrineLiberada(b)) throw new NotFoundError('Clube');
    const oferta = await repo.buscarOferta(b.id, ofertaId);
    if (!oferta || oferta.tipo !== 'clube' || !oferta.publica || oferta.status !== 'ativa') throw new NotFoundError('Clube');
    const negocio = (await repo.negocioParaPix(b.id))!;
    const pix = gerarPix(negocio, Number(oferta.preco), oferta.nome);
    if (!pix) throw new ValidationError('Este salão ainda não pode receber por Pix');

    const client = await publicBookingRepository.findOrCreateClient(b.id, input.nome, input.telefone);
    const { timezone } = await getBusinessScheduleSettings(b.id);
    const hoje = todayInTimezone(timezone);

    const r = await repo.transacao(async (tx) => {
      await repo.travarAdesao(tx, `${client.id}|${oferta.id}`);
      const vigente = await repo.temContratoVigente(tx, b.id, client.id, oferta.id);
      if (vigente && vigente.status !== 'aguardando_pagamento') throw new ConflictError('Você já é assinante deste clube');
      if (vigente) {
        const pendente = await repo.pendenteDoContrato(tx, vigente.id);
        if (pendente) return { contratoId: vigente.id, cobranca: pendente, nova: false };
      }
      const contrato = await criarContrato(tx, b.id, oferta, client.id, 'publico', null);
      const cobranca = await tx.clubeCobranca.create({
        data: {
          businessId: b.id, contratoId: contrato.id, competencia: repo.data(hoje), vencimento: repo.data(hoje),
          valor: oferta.preco, pixCopiaCola: pix,
        },
      });
      return { contratoId: contrato.id, cobranca, nova: true };
    });

    if (r.nova) {
      await publicBookingRepository.registrarConsentimento({ businessId: b.id, clientId: client.id })
        .catch((err) => logger.warn({ err }, 'Consentimento da adesão não registrado'));
      await notificationsService.notify(b.id, {
        type: 'clube_adesao', title: 'Nova adesão ao clube',
        description: `${input.nome} · ${oferta.nome} — confirme o Pix para ativar`, link: '/clube/assinantes?status=aguardando_pagamento',
      }).catch((err) => logger.warn({ err }, 'Aviso de adesão não criado'));
      const contrato = await repo.buscarContrato(prisma, b.id, r.contratoId);
      if (contrato) await enviarCobranca(b.id, contrato, r.cobranca, true);
    }
    return {
      oferta: { id: oferta.id, nome: oferta.nome },
      cobranca: { valor: Number(r.cobranca.valor), pixCopiaCola: r.cobranca.pixCopiaCola, vencimento: r.cobranca.vencimento.toISOString().slice(0, 10) },
      repetida: !r.nova,
    };
  },
};
