import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAN_MAP, SAAS_PLANS, PLAN_SHELL_LABEL } from '@/lib/plans';
import { PLANS } from '@/lib/constants';
import { evaluateFeatureAccess } from '@/lib/subscriptionAccess';

describe('planos', () => {
  it('o cliente vê só Solo / Equipe / Salão, com os preços cobrados no Asaas', () => {
    expect(SAAS_PLANS.map((p) => [p.id, p.name, p.price])).toEqual([
      ['basico', 'Solo', 49.9],
      ['profissional', 'Equipe', 99.9],
      ['premium', 'Salão', 199.9],
    ]);
    for (const plan of SAAS_PLANS) {
      expect(PLAN_SHELL_LABEL[plan.id]).toBe(plan.name);
      expect(PLANS[plan.id].name).toBe(plan.name);
    }
  });

  it('nenhum texto de plano cita os nomes antigos', () => {
    const textos = SAAS_PLANS.flatMap((p) => [p.name, p.ctaLabel, p.description, ...p.features]).join(' | ');
    expect(textos).not.toMatch(/Básico|Profissional\b|Premium|\bPro\b/);
  });

  it('o Solo promete WhatsApp e o acesso libera WhatsApp no Solo', () => {
    expect(PLAN_MAP.basico.features.some((f) => /WhatsApp/.test(f))).toBe(true);
    const acesso = evaluateFeatureAccess({
      feature: 'whatsapp_automation',
      plan: 'basico',
      subscriptionStatus: 'active',
    });
    expect(acesso.allowed).toBe(true);
  });

  it('relatórios continuam a partir do Equipe, com mensagem usando o nome visível', () => {
    const acesso = evaluateFeatureAccess({ feature: 'reports', plan: 'basico', subscriptionStatus: 'active' });
    expect(acesso.allowed).toBe(false);
    expect(acesso.message).toBe('Esta funcionalidade requer o plano Equipe ou superior.');
  });
});

describe('catálogo do backend', () => {
  it('a landing anuncia os mesmos preços que o backend cobra (backend/src/config/planCatalog.ts)', () => {
    const catalogo = readFileSync(resolve(__dirname, '../../../../backend/src/config/planCatalog.ts'), 'utf-8');
    for (const plan of SAAS_PLANS) {
      const bloco = new RegExp(`${plan.id}: \\{\\s*id: '${plan.id}',\\s*nome: '([^']+)',\\s*preco: ([\\d.]+)`).exec(catalogo);
      expect(bloco, `plano ${plan.id} no catálogo`).not.toBeNull();
      expect(bloco![1]).toBe(plan.name);
      expect(Number(bloco![2])).toBe(plan.price);
    }
  });
});
