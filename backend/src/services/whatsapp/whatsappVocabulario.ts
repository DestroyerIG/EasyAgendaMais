import { artigo, maiuscula, pelo, type Vocabulario } from '../../config/vocabulario.js';
import { DEFAULT_BOT_CONFIG, type BotConfig } from './whatsappConstants.js';

// Vocabulário do segmento nas mensagens do bot (fase 6). Só os textos que ainda são o padrão mudam:
// o que a dona editou fica como ela escreveu.

const rotuloProfissional = (v: Vocabulario) => maiuscula(v.profissional.singular);

/**
 * As mensagens padrão já com os termos do segmento. Cobre todo o catálogo de textos (e o lembrete,
 * que fica fora dele). No segmento `outro` valem os textos de sempre ("o profissional").
 */
export function mensagensPadrao(v: Vocabulario): BotConfig {
  const base: BotConfig = { ...DEFAULT_BOT_CONFIG };
  if (v.segmento === 'outro') return base;
  const p = v.profissional;
  const rotulo = (texto: string) => texto.replace('👤 Profissional:', `👤 ${rotuloProfissional(v)}:`);
  return {
    ...base,
    confirmation_message: rotulo(base.confirmation_message),
    reminder_message: rotulo(base.reminder_message),
    reschedule_success_message: rotulo(base.reschedule_success_message),
    no_slots_message: base.no_slots_message
      .replace('com este profissional', `com ${pelo(p, 'esta', 'este')} ${p.singular}`)
      .replace('outro profissional', `${pelo(p, 'outra', 'outro')} ${p.singular}`),
    choose_professional_title: `Escolha ${artigo(p)} ${p.singular}`,
    no_professionals_message: `Desculpe, não há ${p.plural} disponíveis no momento.`,
  };
}

export function aplicarVocabulario(config: BotConfig, v: Vocabulario): BotConfig {
  const padrao = mensagensPadrao(v);
  const saida: BotConfig = { ...config };
  for (const chave of Object.keys(padrao) as Array<keyof BotConfig>) {
    if (config[chave] === DEFAULT_BOT_CONFIG[chave]) (saida as unknown as Record<string, string>)[chave] = padrao[chave] as string;
  }
  return saida;
}

/** Texto padrão de regras das automações com o gênero da cliente ("A primeira a agendar…"). */
export function textoComCliente(texto: string, v: Vocabulario): string {
  return v.cliente.genero === 'm' ? texto.replace('A primeira a agendar', 'O primeiro a agendar') : texto;
}

/** "👤 Profissional:" do lembrete de 2 h com o termo do segmento. */
export const textoComProfissional = (texto: string, v: Vocabulario) => texto.replace('👤 Profissional:', `👤 ${rotuloProfissional(v)}:`);
