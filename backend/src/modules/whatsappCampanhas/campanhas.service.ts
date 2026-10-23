import type { z } from 'zod';
import { renderizarTexto } from '../whatsappAutomacoes/automacoes.rules.js';
import { PRIORIDADE_CAMPANHA } from '../whatsappFila/fila.rules.js';
import { filaRepository } from '../whatsappFila/fila.repository.js';
import { filaEnvios, type EnvioDto } from '../whatsappFila/fila.service.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { todayInTimezone, zonedToUtc } from '../../utils/businessDate.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { campanhasRepository as repo, type CampanhaRow, type DadosCampanha } from './campanhas.repository.js';
import { comRodape, statusCampanha, validarInicio } from './campanhas.rules.js';
import { publicoService } from './publico.service.js';
import type {
  Cadencia, CampanhaDto, DetalhesCampanhaDto, SalvarCampanhaSchema, Segmento, StatusGravado,
} from './campanhas.types.js';

type SalvarInput = z.infer<typeof SalvarCampanhaSchema>;
type Contagem = Record<EnvioDto['status'], number>;

const MOTIVO_CANCELADA = 'Campanha cancelada';
const CONTAGEM_VAZIA: Contagem = { na_fila: 0, enviando: 0, enviado: 0, falhou: 0, pulado: 0, cancelado: 0 };

async function fusoDo(businessId: string): Promise<string> {
  return (await getBusinessScheduleSettings(businessId)).timezone || 'America/Sao_Paulo';
}

const horaNoFuso = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

/** "2026-02-31" passa na regex mas não existe no calendário. */
function dataExiste(ymd: string): boolean {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return !isNaN(dt.getTime()) && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function inicioDe(input: SalvarInput, tz: string, agora: Date): Date {
  if (!dataExiste(input.data)) throw new ValidationError('Data inválida');
  const inicio = input.acao === 'agendar'
    ? validarInicio(input.data, input.hora, tz, agora)
    : zonedToUtc(input.data, input.hora, tz);
  if (isNaN(inicio.getTime())) throw new ValidationError('Data inválida');
  return inicio;
}

function paraDto(c: CampanhaRow, contagem: Contagem, tz: string, agora: Date): CampanhaDto {
  const restantes = contagem.na_fila + contagem.enviando;
  return {
    id: c.id,
    nome: c.nome,
    segmento: c.segmento as Segmento,
    professionalId: c.professionalId,
    serviceId: c.serviceId,
    texto: c.texto,
    data: todayInTimezone(tz, c.inicioEm),
    hora: horaNoFuso(c.inicioEm, tz),
    cadencia: c.cadencia as Cadencia,
    status: statusCampanha({ status: c.status as StatusGravado, inicioEm: c.inicioEm }, restantes, agora),
    total: c.total,
    enviadas: contagem.enviado,
    createdAt: c.createdAt.toISOString(),
  };
}

async function contagemDe(businessId: string, id: string): Promise<Contagem> {
  return (await filaRepository.contagemDoLote(businessId, [id])).get(id) ?? CONTAGEM_VAZIA;
}

async function buscarOu404(businessId: string, id: string): Promise<CampanhaRow> {
  const c = await repo.buscar(businessId, id);
  if (!c) throw new NotFoundError('Campanha');
  return c;
}

/** Grava (ou atualiza) como rascunho. */
async function gravarRascunho(
  businessId: string, userId: string, dados: DadosCampanha, id: string | undefined,
): Promise<CampanhaRow> {
  if (!id) return repo.criar({ ...dados, businessId, createdBy: userId, status: 'rascunho' });
  const atual = await buscarOu404(businessId, id);
  if (atual.status !== 'rascunho') throw new ConflictError('Só rascunhos podem ser editados');
  const atualizada = await repo.atualizarRascunho(businessId, id, dados);
  if (!atualizada) throw new ConflictError('Só rascunhos podem ser editados');
  return atualizada;
}

/** Monta o público e põe na fila; devolve quantas entraram neste lote e quantas já estavam na fila de outro. */
async function enfileirarCampanha(businessId: string, c: CampanhaRow, inicio: Date, agora: Date): Promise<{ total: number; jaNaFila: number }> {
  const { elegiveis } = await publicoService.montar(
    businessId, { segmento: c.segmento as Segmento, professionalId: c.professionalId, serviceId: c.serviceId }, inicio, agora,
  );
  if (elegiveis.length === 0) {
    await repo.voltarRascunho(businessId, c.id);
    throw new ValidationError('Nenhuma cliente pode receber esta campanha');
  }

  let envios: EnvioDto[];
  try {
    envios = await filaEnvios.enfileirar(elegiveis.map((e) => ({
      businessId,
      clientId: e.id,
      phone: e.telefone,
      body: comRodape(renderizarTexto(c.texto, e.vars)),
      origin: 'campanha' as const,
      agendadoPara: inicio,
      loteId: c.id,
      prioridade: PRIORIDADE_CAMPANHA,
    })));
  } catch (err) {
    await filaRepository.cancelarDoLote(businessId, c.id, MOTIVO_CANCELADA);
    await repo.voltarRascunho(businessId, c.id);
    throw err;
  }

  // A deduplicação da fila devolve o envio que já existia, possivelmente de outra campanha.
  const total = envios.filter((e) => e.loteId === c.id).length;
  if (total === 0) {
    await filaRepository.cancelarDoLote(businessId, c.id, MOTIVO_CANCELADA);
    await repo.voltarRascunho(businessId, c.id);
    throw new ValidationError('Todas as clientes deste público já estão na fila de outra campanha');
  }
  await repo.gravarTotal(businessId, c.id, total);
  return { total, jaNaFila: envios.length - total };
}

export const campanhasService = {
  async listar(businessId: string, agora: Date = new Date()): Promise<CampanhaDto[]> {
    const [tz, linhas] = await Promise.all([fusoDo(businessId), repo.listar(businessId)]);
    const contagens = await filaRepository.contagemDoLote(businessId, linhas.map((c) => c.id));
    return linhas.map((c) => paraDto(c, contagens.get(c.id) ?? CONTAGEM_VAZIA, tz, agora));
  },

  async detalhes(businessId: string, id: string, agora: Date = new Date()): Promise<DetalhesCampanhaDto> {
    const c = await buscarOu404(businessId, id);
    const [tz, contagem, itens] = await Promise.all([
      fusoDo(businessId), contagemDe(businessId, id), filaRepository.itensDoLote(businessId, id),
    ]);
    return {
      campanha: paraDto(c, contagem, tz, agora),
      contagem: {
        enviadas: contagem.enviado,
        naFila: contagem.na_fila + contagem.enviando,
        puladas: contagem.pulado,
        falhas: contagem.falhou,
        canceladas: contagem.cancelado,
      },
      itens: itens.map((i) => ({
        id: i.id,
        nome: i.client?.name ?? '',
        telefone: i.phone,
        status: i.status as EnvioDto['status'],
        motivo: i.reason,
        enviadoEm: i.sentAt ? i.sentAt.toISOString() : null,
      })),
    };
  },

  async salvar(
    businessId: string, userId: string, input: SalvarInput, id?: string, agora: Date = new Date(),
  ): Promise<{ campanha: CampanhaDto; jaNaFila: number }> {
    const tz = await fusoDo(businessId);
    // WhatsApp desconectado não impede o agendamento: a fila espera a conexão.
    const inicio = inicioDe(input, tz, agora);
    const dados: DadosCampanha = {
      nome: input.nome, segmento: input.segmento, professionalId: input.professionalId, serviceId: input.serviceId,
      texto: input.texto, inicioEm: inicio, cadencia: input.cadencia,
    };
    const rascunho = await gravarRascunho(businessId, userId, dados, id);
    if (input.acao === 'rascunho') {
      return { campanha: paraDto(rascunho, CONTAGEM_VAZIA, tz, agora), jaNaFila: 0 };
    }

    if ((await repo.marcarAgendada(businessId, rascunho.id)) === 0) throw new ConflictError('Esta campanha já foi agendada');
    const { total, jaNaFila } = await enfileirarCampanha(businessId, rascunho, inicio, agora);
    const campanha = paraDto({ ...rascunho, status: 'agendada', total }, await contagemDe(businessId, rascunho.id), tz, agora);
    return { campanha, jaNaFila };
  },

  async cancelar(businessId: string, id: string, agora: Date = new Date()): Promise<CampanhaDto> {
    const c = await buscarOu404(businessId, id);
    if (c.status !== 'agendada') throw new ConflictError('Esta campanha não está agendada');
    if ((await repo.marcarCancelada(businessId, id)) === 0) throw new ConflictError('Esta campanha não está agendada');
    // Só o que ainda está na fila; o que já saiu ou está saindo fica como está.
    await filaRepository.cancelarDoLote(businessId, id, MOTIVO_CANCELADA);
    const [tz, atual, contagem] = await Promise.all([fusoDo(businessId), buscarOu404(businessId, id), contagemDe(businessId, id)]);
    return paraDto(atual, contagem, tz, agora);
  },
};
