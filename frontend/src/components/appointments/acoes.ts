/**
 * Ações de um agendamento, a mesma lista para o bloco da linha do tempo, o cartão do
 * celular e o painel de detalhes. "Concluir" não muda o status direto: abre a comanda,
 * que é quem conclui o atendimento ao ser fechada (o backend recusa `concluido` em
 * PUT /appointments/:id/status).
 */
import type { AppointmentStatus } from '@/types';

export type AcaoAgendamento = 'iniciar' | 'concluir' | 'faltou' | 'cancelar' | 'desfazer_inicio';

export const ACOES_POR_STATUS: Record<AppointmentStatus, AcaoAgendamento[]> = {
  aguardando_pagamento: ['cancelar'],
  confirmado: ['iniciar', 'concluir', 'faltou', 'cancelar'],
  em_atendimento: ['concluir', 'desfazer_inicio', 'cancelar'],
  concluido: [],
  faltou: [],
  cancelado: [],
};

export const ROTULO_ACAO: Record<AcaoAgendamento, { texto: string; icone: string }> = {
  iniciar: { texto: 'Iniciar atendimento', icone: 'play_circle' },
  concluir: { texto: 'Concluir atendimento', icone: 'task_alt' },
  faltou: { texto: 'Cliente faltou', icone: 'person_off' },
  cancelar: { texto: 'Cancelar', icone: 'cancel' },
  desfazer_inicio: { texto: 'Voltar para confirmado', icone: 'undo' },
};
