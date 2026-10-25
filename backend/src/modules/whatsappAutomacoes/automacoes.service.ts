import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { sendWhatsAppMessage } from '../../services/whatsapp/whatsappMessageService.js';
import { AppError, ValidationError } from '../../utils/errors.js';
import { automacoesRepository } from './automacoes.repository.js';
import { CONFIG_SCHEMA, TEXTO_PADRAO, TEXTO_PADRAO_LEMBRETE_2H, VARIAVEIS, lerConfig, renderizarTexto } from './automacoes.rules.js';
import { REGRAS, type ConfigRegras, type Regra, type RegraDto } from './automacoes.types.js';
import { vocabularioDe, type Vocabulario } from '../../config/vocabulario.js';
import { textoComCliente, textoComProfissional } from '../../services/whatsapp/whatsappVocabulario.js';

export interface AtualizarAutomacao<R extends Regra> {
  ativa?: boolean;
  texto?: string | null;
  config?: Partial<ConfigRegras[R]>;
}

interface Linha { ativa: boolean; texto: string | null; config: unknown }

function textoPadraoDe(regra: Regra, config: ConfigRegras[Regra], v: Vocabulario): string {
  if (regra === 'lembrete' && (config as ConfigRegras['lembrete']).modo === '2h') return textoComProfissional(TEXTO_PADRAO_LEMBRETE_2H, v);
  return textoComCliente(TEXTO_PADRAO[regra], v);
}

function montar<R extends Regra>(regra: R, linha: Linha | undefined, legado: { ativa: boolean; texto: string | null }, v: Vocabulario): RegraDto<R> {
  // Linha salva do lembrete ganha do legado; sem linha, o lembrete herda o legado.
  const ativa = linha ? linha.ativa : regra === 'lembrete' ? legado.ativa : false;
  const textoSalvo = linha ? linha.texto : regra === 'lembrete' ? legado.texto : null;
  const config = lerConfig(regra, linha?.config);
  const textoPadrao = textoPadraoDe(regra, config, v);
  const personalizado = !!textoSalvo && textoSalvo.trim() !== '';
  return { regra, ativa, texto: personalizado ? textoSalvo! : textoPadrao, textoPadrao, personalizado, config, variaveis: VARIAVEIS[regra] };
}

const EXEMPLO: Record<string, string> = {
  nome: 'Mariana', nome_cliente: 'Mariana', primeiro_nome: 'Mariana', servico: 'Design de Sobrancelha',
  horario: '14:00', data: 'amanhã', profissional: 'Camila', ultimo_servico: 'Design de Sobrancelha', dias: '21',
  valor_sinal: '30,00', pix_copia_e_cola: '00020126...', prazo: '15', presente: 'R$ 20 OFF', endereco: 'Rua das Flores, 123',
  link_mapa: 'https://maps.google.com', link_agenda: 'https://exemplo.com/agenda', link: 'https://exemplo.com',
  link_avaliacao: 'https://exemplo.com/avaliar', horarios_livres: 'amanhã 14:00',
};

export const automacoes = {
  async obterTodas(businessId: string): Promise<RegraDto[]> {
    const [linhas, legado, segmento] = await Promise.all([
      automacoesRepository.listar(businessId),
      automacoesRepository.legadoLembrete(businessId),
      Promise.resolve().then(() => automacoesRepository.segmento(businessId)).catch(() => null),
    ]);
    const porRegra = new Map(linhas.map((l) => [l.regra, l]));
    const v = vocabularioDe(segmento);
    return REGRAS.map((r) => montar(r, porRegra.get(r), legado, v));
  },

  async obter<R extends Regra>(businessId: string, regra: R): Promise<RegraDto<R>> {
    const todas = await this.obterTodas(businessId);
    return todas.find((d) => d.regra === regra) as RegraDto<R>;
  },

  async atualizar<R extends Regra>(businessId: string, regra: R, patch: AtualizarAutomacao<R>): Promise<RegraDto<R>> {
    if (patch.texto !== undefined && patch.texto !== null && (patch.texto.trim().length < 1 || patch.texto.length > 1000)) {
      throw new ValidationError('O texto deve ter de 1 a 1000 caracteres');
    }
    const atual = await this.obter(businessId, regra);
    const dados: { ativa?: boolean; texto?: string | null; config?: object } = {};
    if (patch.ativa !== undefined) dados.ativa = patch.ativa;
    if (patch.texto !== undefined) dados.texto = patch.texto;
    if (patch.config !== undefined) {
      // Valida só os campos enviados e depois o conjunto mesclado; inválido é erro.
      const schema = CONFIG_SCHEMA[regra] as unknown as {
        partial(): { strict(): { safeParse(v: unknown): { success: boolean } } };
        safeParse(v: unknown): { success: boolean; data?: unknown };
      };
      if (!schema.partial().strict().safeParse(patch.config).success) throw new ValidationError('Configuração inválida');
      const final = schema.safeParse({ ...atual.config, ...patch.config });
      if (!final.success) throw new ValidationError('Configuração inválida');
      dados.config = final.data as object;
    }
    // Na primeira gravação, fixa o estado herdado do legado (ligado/texto) para não perdê-lo.
    const linhas = await automacoesRepository.listar(businessId);
    if (!linhas.some((l) => l.regra === regra)) {
      if (dados.ativa === undefined) dados.ativa = atual.ativa;
      if (dados.texto === undefined && atual.personalizado) dados.texto = atual.texto;
    }
    await automacoesRepository.salvar(businessId, regra, dados);
    return this.obter(businessId, regra);
  },

  async testar(businessId: string, regra: Regra): Promise<{ enviado: true; para: string }> {
    const conexao = await whatsappService.getStatus(businessId);
    if (conexao?.status !== 'connected') throw new AppError('Conecte o WhatsApp para testar', 409, 'WHATSAPP_DISCONNECTED');
    const negocio = await automacoesRepository.negocio(businessId);
    if (!negocio.whatsapp) throw new ValidationError('Cadastre o número do negócio');
    const dto = await this.obter(businessId, regra);
    const texto = renderizarTexto(dto.texto, { ...EXEMPLO, negocio: negocio.nome });
    const ok = await sendWhatsAppMessage(negocio.whatsapp, texto, { businessId, origin: 'sistema' }).catch(() => false);
    if (!ok) throw new AppError('Não foi possível enviar o teste. Tente de novo.', 502);
    return { enviado: true, para: negocio.whatsapp };
  },
};
