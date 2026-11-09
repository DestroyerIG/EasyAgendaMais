import { prisma } from '../../config/prisma.js';
import type { HorariosInput, NegocioInput, ServicosInput } from './onboarding.types.js';
import { ETAPA_CONCLUIDA, etapaDepoisDe } from './onboarding.rules.js';

// Onboarding guiado (fase 6): cada etapa grava os campos que Ajustes, Serviços e a Minha página já usam.

const hora = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

const avancar = async (tx: Pick<typeof prisma, 'business'>, businessId: string, salva: number) => {
  const b = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { onboardingEtapa: true } });
  await tx.business.update({ where: { id: businessId }, data: { onboardingEtapa: etapaDepoisDe(b.onboardingEtapa, salva) } });
};

export const onboardingRepository = {
  estado(businessId: string) {
    return prisma.business.findUnique({
      where: { id: businessId },
      select: {
        name: true, ownerName: true, slug: true, pixKey: true, logoUrl: true, brandColor: true, galleryPhotos: true,
        whatsappConnectedAt: true, onboardingEtapa: true, onboardingConcluidoEm: true, primeirosPassosDispensadoEm: true,
        settings: {
          select: { segment: true, modoEquipe: true, diasAbertos: true, openingTime: true, closingTime: true, slotIntervalMinutes: true },
        },
        professionals: {
          where: { active: true }, orderBy: { createdAt: 'asc' }, take: 1,
          select: { id: true, breakStart: true, breakEnd: true },
        },
        services: {
          where: { active: true }, orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, price: true, durationMinutes: true, depositPercentage: true },
        },
      },
    });
  },

  /** Etapa 1. "Sozinha" cria a profissional com o nome da responsável (uma vez só). */
  salvarNegocio(businessId: string, d: NegocioInput) {
    return prisma.$transaction(async (tx) => {
      await tx.businessSettings.upsert({
        where: { businessId },
        create: { businessId, segment: d.segmento, modoEquipe: d.modoEquipe },
        update: { segment: d.segmento, modoEquipe: d.modoEquipe },
      });
      if (d.modoEquipe === 'sozinha') {
        const existe = await tx.professional.count({ where: { businessId, active: true } });
        if (existe === 0) {
          const b = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { ownerName: true } });
          await tx.professional.create({ data: { businessId, name: b.ownerName } });
        }
      }
      await avancar(tx, businessId, 1);
    });
  },

  /** Etapa 2. A pausa vai para a profissional quando ela atende sozinha. */
  salvarHorarios(businessId: string, d: HorariosInput) {
    return prisma.$transaction(async (tx) => {
      const horarios = {
        diasAbertos: d.diasAbertos, openingTime: hora(d.abertura), closingTime: hora(d.fechamento), slotIntervalMinutes: d.intervaloMinutos,
      };
      const s = await tx.businessSettings.upsert({
        where: { businessId }, create: { businessId, ...horarios }, update: horarios, select: { modoEquipe: true },
      });
      if (s.modoEquipe === 'sozinha') {
        const p = await tx.professional.findFirst({ where: { businessId, active: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
        if (p) {
          await tx.professional.update({
            where: { id: p.id },
            data: { breakStart: d.pausa ? hora(d.pausa.inicio) : null, breakEnd: d.pausa ? hora(d.pausa.fim) : null },
          });
        }
      }
      await avancar(tx, businessId, 2);
    });
  },

  /**
   * Etapa 3. Atualiza pelo nome o que já existe (voltar e avançar de novo não duplica) e desativa os
   * serviços sem agendamento que saíram da lista. Com sinal, grava a chave Pix.
   */
  salvarServicos(businessId: string, d: ServicosInput) {
    return prisma.$transaction(async (tx) => {
      const atuais = await tx.service.findMany({ where: { businessId, active: true }, select: { id: true, name: true } });
      const porNome = new Map(atuais.map((s) => [s.name.trim().toLowerCase(), s.id]));
      const mantidos = new Set<string>();
      for (const s of d.servicos) {
        const data = { name: s.nome.trim(), price: s.preco, durationMinutes: s.duracaoMinutos, depositPercentage: s.sinalPct || null };
        const id = porNome.get(s.nome.trim().toLowerCase());
        if (id) {
          await tx.service.update({ where: { id }, data });
          mantidos.add(id);
        } else {
          await tx.service.create({ data: { businessId, ...data } });
        }
      }
      const fora = atuais.filter((s) => !mantidos.has(s.id)).map((s) => s.id);
      if (fora.length) {
        await tx.service.updateMany({ where: { id: { in: fora }, appointments: { none: {} } }, data: { active: false } });
      }
      if (d.chavePix) {
        await tx.business.update({ where: { id: businessId }, data: { pixKey: d.chavePix.chave, pixKeyType: d.chavePix.tipo } });
      }
      await avancar(tx, businessId, 3);
    });
  },

  concluir(businessId: string) {
    return prisma.business.updateMany({
      where: { id: businessId, onboardingConcluidoEm: null },
      data: { onboardingEtapa: ETAPA_CONCLUIDA, onboardingConcluidoEm: new Date() },
    });
  },

  dispensarPrimeirosPassos(businessId: string) {
    return prisma.business.update({ where: { id: businessId }, data: { primeirosPassosDispensadoEm: new Date() }, select: { id: true } });
  },

  slugEmUso(slug: string, businessId: string) {
    return prisma.business.count({ where: { slug, id: { not: businessId } } }).then((n) => n > 0);
  },

  /** Segmento e onboarding para o /auth/me. */
  resumo(businessId: string) {
    return prisma.business.findUnique({
      where: { id: businessId },
      select: { onboardingEtapa: true, onboardingConcluidoEm: true, logoUrl: true, settings: { select: { segment: true } } },
    });
  },
};
