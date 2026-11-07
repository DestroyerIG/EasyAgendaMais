import { vi, describe, it, expect, beforeEach } from 'vitest';

type Linha = Record<string, unknown>;
const estado = vi.hoisted(() => ({ linha: null as Record<string, unknown> | null, segmento: null as string | null }));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    whatsappBotConfig: {
      findFirst: vi.fn(async () => estado.linha),
      upsert: vi.fn(async ({ create, update }: { create: Linha; update: Linha }) => {
        estado.linha = estado.linha ? { ...estado.linha, ...update } : { textosExtras: {}, ...create };
        return estado.linha;
      }),
    },
    businessSettings: { findUnique: vi.fn(async () => (estado.segmento ? { segment: estado.segmento } : null)) },
  },
}));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { CATALOGO_TEXTOS, textosDoNegocio, salvarTextos } = await import('../services/whatsapp/whatsappTextos.js');
const { getBotConfig } = await import('../services/whatsapp/whatsappConfigService.js');
const { DEFAULT_BOT_CONFIG, PADROES_ANTIGOS } = await import('../services/whatsapp/whatsappConstants.js');
const { mensagensPadrao } = await import('../services/whatsapp/whatsappVocabulario.js');
const { VOCABULARIO } = await import('../config/vocabulario.js');

const ID = 'b1';

beforeEach(() => {
  estado.linha = null;
  estado.segmento = null;
});

describe('catálogo', () => {
  it('não repete chave e deixa de fora sessão expirada, lembrete e avaliação', () => {
    const chaves = CATALOGO_TEXTOS.map((t) => t.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const fora of ['session_expired_message', 'reminder_message', 'rating_question_message', 'rating_confirmation_message', 'no_previous_appointments_message']) {
      expect(chaves).not.toContain(fora);
    }
  });

  it('todo texto tem padrão em todos os segmentos', () => {
    for (const v of Object.values(VOCABULARIO)) {
      const padrao = mensagensPadrao(v);
      for (const t of CATALOGO_TEXTOS) expect(typeof (padrao as Record<string, unknown>)[t.chave], `${v.segmento}/${t.chave}`).toBe('string');
    }
  });

  it('segmento outro mantém os textos de sempre', () => {
    const padrao = mensagensPadrao(VOCABULARIO.outro) as Record<string, string>;
    for (const t of CATALOGO_TEXTOS) expect(padrao[t.chave]).toBe((DEFAULT_BOT_CONFIG as unknown as Record<string, string>)[t.chave]);
  });

  it('confirmação tem horário e data como variáveis importantes; política e promoções aceitam vazio', () => {
    const por = Object.fromEntries(CATALOGO_TEXTOS.map((t) => [t.chave, t]));
    expect(por.confirmation_message.importantes).toEqual(['horario', 'data']);
    expect(por.politica_message).toMatchObject({ permiteVazio: true, max: 1000, caminho: 'geral', rotulo: 'Resposta rápida: Política' });
    expect(por.promotions_message.permiteVazio).toBe(true);
    expect(por.cancel_list_message.caminho).toBe('cancel');
    expect(por.reschedule_list_message.caminho).toBe('reschedule');
    expect(por.end_session_message.caminho).toBe('end_session');
    expect(por.cancel_success_message.caminho).toBe('manage');
    expect(por.reschedule_success_message.caminho).toBe('manage');
  });
});

describe('textosDoNegocio / salvarTextos', () => {
  it('sem configuração nada é personalizado e o valor é o padrão', async () => {
    const textos = await textosDoNegocio(ID);
    expect(textos).toHaveLength(CATALOGO_TEXTOS.length);
    expect(textos.filter((t) => t.personalizado)).toEqual([]);
    for (const t of textos) expect(t.valor).toBe(t.padrao);
  });

  it('salvar sem mexer não personaliza nada', async () => {
    const antes = await textosDoNegocio(ID);
    const depois = await salvarTextos(ID, Object.fromEntries(antes.map((t) => [t.chave, t.valor])));
    expect(depois.filter((t) => t.personalizado)).toEqual([]);
    expect(estado.linha?.attendantMessage).toBeNull();
    expect(estado.linha?.textosExtras).toEqual({});
  });

  it('texto igual ao padrão atual gravado no banco não conta como personalizado', async () => {
    estado.linha = {
      textosExtras: { manage_list_message: DEFAULT_BOT_CONFIG.manage_list_message },
      attendantMessage: PADROES_ANTIGOS.attendant_message,
      cancelListMessage: DEFAULT_BOT_CONFIG.cancel_list_message,
    };
    expect((await textosDoNegocio(ID)).filter((t) => t.personalizado)).toEqual([]);
  });

  it('grava o editado na coluna ou em textos_extras', async () => {
    const r = await salvarTextos(ID, { attendant_message: 'Já te respondo!', manage_list_message: 'Seus horários:' });
    expect(estado.linha?.attendantMessage).toBe('Já te respondo!');
    expect(estado.linha?.textosExtras).toEqual({ manage_list_message: 'Seus horários:' });
    expect(r.filter((t) => t.personalizado).map((t) => t.chave).sort()).toEqual(['attendant_message', 'manage_list_message']);
    const cfg = await getBotConfig(ID);
    expect(cfg.manage_list_message).toBe('Seus horários:');
    expect(cfg.attendant_message).toBe('Já te respondo!');
  });

  it('recusa vazio, menos promoções e política', async () => {
    await expect(salvarTextos(ID, { attendant_message: '  ' })).rejects.toThrow();
    await expect(salvarTextos(ID, { manage_list_message: '' })).rejects.toThrow();
    await expect(salvarTextos(ID, { promotions_message: '' })).resolves.toBeDefined();
    await expect(salvarTextos(ID, { politica_message: '' })).resolves.toBeDefined();
  });

  it('recusa texto acima do limite (2000, política 1000)', async () => {
    await expect(salvarTextos(ID, { attendant_message: 'a'.repeat(2001) })).rejects.toThrow();
    await expect(salvarTextos(ID, { attendant_message: 'a'.repeat(2000) })).resolves.toBeDefined();
    await expect(salvarTextos(ID, { politica_message: 'a'.repeat(1001) })).rejects.toThrow();
  });

  it('null restaura o padrão', async () => {
    await salvarTextos(ID, { attendant_message: 'Já te respondo!', manage_list_message: 'Seus horários:' });
    const r = await salvarTextos(ID, { attendant_message: null, manage_list_message: null });
    expect(r.filter((t) => t.personalizado)).toEqual([]);
    expect(estado.linha?.attendantMessage).toBeNull();
    expect(estado.linha?.textosExtras).toEqual({});
  });

  it('recusa chave fora do catálogo e valor que não é texto', async () => {
    await expect(salvarTextos(ID, { session_expired_message: 'x' })).rejects.toThrow();
    await expect(salvarTextos(ID, { attendant_message: 5 as unknown as string })).rejects.toThrow();
  });

  it('chave não enviada não é mexida', async () => {
    await salvarTextos(ID, { attendant_message: 'A' });
    await salvarTextos(ID, { manage_list_message: 'B' });
    expect(estado.linha?.attendantMessage).toBe('A');
  });

  it('valor igual ao padrão do segmento é gravado como nulo', async () => {
    estado.segmento = 'barbearia';
    const antes = await textosDoNegocio(ID);
    const conf = antes.find((t) => t.chave === 'confirmation_message')!;
    expect(conf.padrao).toContain('👤 Barbeiro:');
    await salvarTextos(ID, { confirmation_message: conf.padrao });
    expect(estado.linha?.confirmationMessage).toBeNull();
  });

  it('texto editado não muda ao trocar de segmento; o padrão acompanha', async () => {
    estado.segmento = 'barbearia';
    await salvarTextos(ID, { confirmation_message: 'Fechado com {profissional}!' });
    estado.segmento = 'unhas';
    const textos = await textosDoNegocio(ID);
    const conf = textos.find((x) => x.chave === 'confirmation_message')!;
    expect(conf.valor).toBe('Fechado com {profissional}!');
    expect(conf.personalizado).toBe(true);
    expect(conf.padrao).toContain('👤 Nail designer:');
    expect((await getBotConfig(ID)).confirmation_message).toBe('Fechado com {profissional}!');
    const semHorario = textos.find((x) => x.chave === 'no_slots_message')!;
    expect(semHorario.padrao).toContain('com esta nail designer');
    expect(semHorario.personalizado).toBe(false);
  });
});

describe('textos do fluxo', () => {
  const NOVAS: Record<string, { caminho: string; variaveis: string[] }> = {
    services_list_title: { caminho: 'view_services', variaveis: [] },
    no_services_message: { caminho: 'view_services', variaveis: [] },
    name_greeting_message: { caminho: 'schedule', variaveis: ['nome_cliente'] },
    choose_service_title: { caminho: 'schedule', variaveis: [] },
    choose_date_title: { caminho: 'schedule', variaveis: [] },
    choose_time_title: { caminho: 'schedule', variaveis: [] },
    closed_day_message: { caminho: 'schedule', variaveis: [] },
    slot_taken_message: { caminho: 'schedule', variaveis: [] },
    walkin_notice: { caminho: 'schedule', variaveis: [] },
    booking_failed_message: { caminho: 'schedule', variaveis: [] },
    new_date_title: { caminho: 'manage', variaveis: [] },
    list_error_message: { caminho: 'manage', variaveis: [] },
    manage_action_message: { caminho: 'manage', variaveis: ['data', 'horario'] },
    cancel_success_message: { caminho: 'manage', variaveis: [] },
    reschedule_success_message: { caminho: 'manage', variaveis: ['servico', 'profissional', 'data', 'horario'] },
    out_of_hours_message: { caminho: 'geral', variaveis: ['horario_atendimento'] },
    today_hours_message: { caminho: 'geral', variaveis: ['hora_fechamento'] },
    paused_message: { caminho: 'geral', variaveis: ['nome_negocio'] },
    invalid_list_choice_message: { caminho: 'geral', variaveis: [] },
  };

  it('toda chave do catálogo tem padrão e só lembrete e sessão expirada ficam fora dele', () => {
    const chaves = CATALOGO_TEXTOS.map((t) => t.chave as string);
    for (const c of chaves) expect(Object.keys(DEFAULT_BOT_CONFIG), c).toContain(c);
    const fora = Object.keys(DEFAULT_BOT_CONFIG).filter((k) => !chaves.includes(k)).sort();
    expect(fora).toEqual(['reminder_message', 'session_expired_message']);
  });

  it.each(Object.entries(NOVAS))('%s: caminho e variáveis do catálogo', (chave, esperado) => {
    const def = CATALOGO_TEXTOS.find((t) => t.chave === chave);
    expect(def, chave).toBeDefined();
    expect(def!.caminho).toBe(esperado.caminho);
    expect(def!.variaveis).toEqual(esperado.variaveis);
    expect((DEFAULT_BOT_CONFIG as unknown as Record<string, string>)[chave]!.trim()).not.toBe('');
  });

  it('salva e lê um texto novo em textos_extras', async () => {
    await salvarTextos(ID, { walkin_notice: 'Aceitamos encaixe!' });
    expect(estado.linha?.textosExtras).toEqual({ walkin_notice: 'Aceitamos encaixe!' });
    expect((await getBotConfig(ID)).walkin_notice).toBe('Aceitamos encaixe!');
  });

  it('os padrões não prometem número de opção', () => {
    for (const t of CATALOGO_TEXTOS) {
      expect((DEFAULT_BOT_CONFIG as unknown as Record<string, string>)[t.chave], t.chave).not.toMatch(/escolha a opção \d/i);
    }
  });
});
