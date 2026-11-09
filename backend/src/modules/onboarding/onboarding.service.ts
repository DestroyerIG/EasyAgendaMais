import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors.js';
import { vocabularioDe } from '../../config/vocabulario.js';
import { onboardingRepository as repo } from './onboarding.repository.js';
import { catalogoDe } from './onboarding.catalogo.js';
import { errosDosHorarios, estadoOnboarding, podeConcluir, precisaDePix, primeirosPassos, slugDoNome } from './onboarding.rules.js';
import type { HorariosInput, NegocioInput, OnboardingDto, PrimeiroPasso, Segmento, ServicosInput } from './onboarding.types.js';

const hhmm = (d: Date | null | undefined) => (d ? d.toISOString().substring(11, 16) : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function carregar(businessId: string) {
  const b = await repo.estado(businessId);
  if (!b) throw new NotFoundError('Negócio');
  return b;
}

/** Sugere um endereço livre a partir do nome (acrescenta -2, -3… se já estiver em uso). */
async function slugLivre(nome: string, businessId: string) {
  const base = slugDoNome(nome);
  for (let i = 1; i <= 20; i++) {
    const candidato = i === 1 ? base : `${base}-${i}`;
    if (!(await repo.slugEmUso(candidato, businessId))) return candidato;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export const onboardingService = {
  async ver(businessId: string): Promise<OnboardingDto> {
    const b = await carregar(businessId);
    const s = b.settings;
    const p = b.professionals[0];
    return {
      estado: estadoOnboarding(b),
      negocio: {
        nome: b.name, responsavel: b.ownerName,
        // Antes da etapa 1 o segmento ainda é o padrão do banco: a tela mostra nada marcado.
        segmento: b.onboardingEtapa > 1 && s ? (s.segment as Segmento) : null,
        modoEquipe: (s?.modoEquipe as 'sozinha' | 'equipe' | null) ?? null,
      },
      horarios: {
        diasAbertos: s?.diasAbertos ?? ['seg', 'ter', 'qua', 'qui', 'sex'],
        abertura: hhmm(s?.openingTime) ?? '09:00',
        fechamento: hhmm(s?.closingTime) ?? '19:00',
        intervaloMinutos: s?.slotIntervalMinutes ?? 30,
        pausa: p?.breakStart && p?.breakEnd ? { inicio: hhmm(p.breakStart)!, fim: hhmm(p.breakEnd)! } : null,
      },
      servicos: b.services.map((x) => ({
        id: x.id, nome: x.name, duracaoMinutos: x.durationMinutes, preco: Number(x.price), sinalPct: num(x.depositPercentage),
      })),
      pagina: {
        slug: b.slug, slugSugerido: b.slug ?? (await slugLivre(b.name, businessId)),
        logoUrl: b.logoUrl, brandColor: b.brandColor, fotos: b.galleryPhotos.length,
      },
      whatsappConectado: b.whatsappConnectedAt !== null,
      temChavePix: !!b.pixKey,
      vocabulario: vocabularioDe(s?.segment),
    };
  },

  catalogo: (segmento: Segmento) => catalogoDe(segmento),

  async salvarNegocio(businessId: string, d: NegocioInput) {
    await repo.salvarNegocio(businessId, d);
    return this.ver(businessId);
  },

  async salvarHorarios(businessId: string, d: HorariosInput) {
    const erros = errosDosHorarios(d);
    if (erros.length) throw new ValidationError(erros[0]!, erros);
    const b = await carregar(businessId);
    if (b.onboardingEtapa < 2) throw new ConflictError('Conclua a etapa "Seu negócio" antes');
    await repo.salvarHorarios(businessId, d);
    return this.ver(businessId);
  },

  async salvarServicos(businessId: string, d: ServicosInput) {
    const b = await carregar(businessId);
    if (b.onboardingEtapa < 3) throw new ConflictError('Conclua a etapa "Horários" antes');
    if (precisaDePix(d.servicos) && !b.pixKey && !d.chavePix) {
      throw new ValidationError('Informe a chave Pix para cobrar o sinal', ['Cadastre a chave Pix ou tire o sinal dos serviços.']);
    }
    await repo.salvarServicos(businessId, d);
    return this.ver(businessId);
  },

  async concluir(businessId: string) {
    const b = await carregar(businessId);
    if (b.onboardingConcluidoEm === null && !podeConcluir(b.onboardingEtapa)) {
      throw new ConflictError('Conclua as etapas Seu negócio, Horários e Serviços antes');
    }
    await repo.concluir(businessId);
    return this.ver(businessId);
  },

  /** Cartão "Termine de configurar" da tela Hoje: vazio quando dispensado, pendente ou tudo pronto. */
  async primeirosPassos(businessId: string): Promise<PrimeiroPasso[]> {
    const b = await carregar(businessId);
    if (b.onboardingConcluidoEm === null || b.primeirosPassosDispensadoEm !== null) return [];
    return primeirosPassos({
      slug: b.slug,
      whatsappConectado: b.whatsappConnectedAt !== null,
      temChavePix: !!b.pixKey,
      temSinal: b.services.some((x) => Number(x.depositPercentage ?? 0) > 0),
    });
  },

  async dispensarPrimeirosPassos(businessId: string) {
    await repo.dispensarPrimeirosPassos(businessId);
  },

  /** Para o /auth/me: onboarding e vocabulário do negócio. */
  async resumo(businessId: string | null) {
    if (!businessId) return { onboarding: null, vocabulario: vocabularioDe(null), logoUrl: null };
    const b = await repo.resumo(businessId);
    if (!b) return { onboarding: null, vocabulario: vocabularioDe(null), logoUrl: null };
    return { onboarding: estadoOnboarding(b), vocabulario: vocabularioDe(b.settings?.segment), logoUrl: b.logoUrl ?? null };
  },
};
