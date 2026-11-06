import { artigo, maiuscula, pelo, type Vocabulario } from '../../config/vocabulario.js';
import { DEFAULT_BOT_CONFIG, type BotConfig } from './whatsappConstants.js';

// Vocabulário do segmento nas mensagens do bot (fase 6). Só os textos que ainda são o padrão mudam:
// o que a dona editou fica como ela escreveu.

const rotuloProfissional = (v: Vocabulario) => maiuscula(v.profissional.singular);

/** As mensagens padrão já com os termos do segmento. */
export function mensagensPadrao(v: Vocabulario): Partial<BotConfig> {
  const p = v.profissional;
  return {
    confirmation_message: DEFAULT_BOT_CONFIG.confirmation_message.replace('👤 Profissional:', `👤 ${rotuloProfissional(v)}:`),
    reminder_message: DEFAULT_BOT_CONFIG.reminder_message.replace('👤 Profissional:', `👤 ${rotuloProfissional(v)}:`),
    reschedule_success_message: DEFAULT_BOT_CONFIG.reschedule_success_message.replace('👤 Profissional:', `👤 ${rotuloProfissional(v)}:`),
    no_slots_message: DEFAULT_BOT_CONFIG.no_slots_message
      .replace('com este profissional', `com ${pelo(p, 'esta', 'este')} ${p.singular}`)
      .replace('outro profissional', `${pelo(p, 'outra', 'outro')} ${p.singular}`),
  };
}

export function aplicarVocabulario(config: BotConfig, v: Vocabulario): BotConfig {
  // Sem segmento definido, o bot continua com os textos de sempre ("o profissional").
  if (v.segmento === 'outro') return config;
  const padrao = mensagensPadrao(v);
  const saida: BotConfig = { ...config };
  for (const chave of Object.keys(padrao) as Array<keyof BotConfig>) {
    if (config[chave] === DEFAULT_BOT_CONFIG[chave]) (saida as unknown as Record<string, string>)[chave] = padrao[chave] as string;
  }
  saida.choose_professional_title = `Escolha ${artigo(v.profissional)} ${v.profissional.singular}`;
  saida.no_professionals_message = `Desculpe, não há ${v.profissional.plural} disponíveis no momento.`;
  return saida;
}

/** Texto padrão de regras das automações com o gênero da cliente ("A primeira a agendar…"). */
export function textoComCliente(texto: string, v: Vocabulario): string {
  return v.cliente.genero === 'm' ? texto.replace('A primeira a agendar', 'O primeiro a agendar') : texto;
}

/** "👤 Profissional:" do lembrete de 2 h com o termo do segmento. */
export const textoComProfissional = (texto: string, v: Vocabulario) => texto.replace('👤 Profissional:', `👤 ${rotuloProfissional(v)}:`);
