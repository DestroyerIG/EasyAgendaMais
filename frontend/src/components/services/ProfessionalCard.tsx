'use client';

import { Calendar, ChevronRight, Edit2, Trash2 } from 'lucide-react';
import { Card, Avatar, IconButton, Button } from '@/components/ui';
import type { Professional } from '@/types';
import { useVocabulario } from '@/hooks/useVocabulario';
import { cn } from '@/lib/cn';
import { avisoAgendamentosMantidos } from '@/lib/disponibilidade';
import { SwitchDisponibilidade } from '@/components/disponibilidade/SwitchDisponibilidade';

interface ProfessionalCardProps {
  professional: Professional;
  onEdit: () => void;
  onDelete: () => void;
  onViewAgenda: () => void;
  /** Liga/desliga a agenda (novos agendamentos). */
  onToggleDisponivel: (disponivel: boolean) => void;
  salvandoDisponibilidade?: boolean;
}

export const ProfessionalCard = ({ professional, onEdit, onDelete, onViewAgenda, onToggleDisponivel, salvandoDisponibilidade }: ProfessionalCardProps) => {
  const { prof } = useVocabulario();
  const disponivel = professional.available !== false;
  const mantidos = !disponivel ? avisoAgendamentosMantidos(professional.agendamentosFuturos ?? 0) : '';
  return (
  <Card className="flex flex-col gap-4">
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-4">
        <Avatar name={professional.name} src={professional.photo} size={56} />
        <div>
          <h3 className="text-lg font-bold text-ink">{professional.name}</h3>
          <p className="text-[13px] font-semibold text-brand-text">{prof.S}</p>
        </div>
      </div>
      <div className="flex gap-1">
        <IconButton icon={Edit2} label={`Editar ${prof.s}`} onClick={onEdit} />
        <IconButton icon={Trash2} label={`Excluir ${prof.s}`} onClick={onDelete} />
      </div>
    </div>
    <div className="flex items-center justify-between gap-3 rounded-control border border-line bg-surface-2/50 px-3">
      <div className="min-w-0">
        <p className={cn('text-[14px] font-bold', disponivel ? 'text-success-text' : 'text-warning-text')}>
          {disponivel ? 'Disponível' : 'Indisponível'}
        </p>
        <p className="text-[12px] text-muted">
          {disponivel ? 'Recebendo novos agendamentos' : mantidos || 'Novos agendamentos bloqueados'}
        </p>
      </div>
      <SwitchDisponibilidade
        checked={disponivel}
        disabled={salvandoDisponibilidade}
        onCheckedChange={onToggleDisponivel}
        label={`${professional.name} disponível para novos agendamentos`}
      />
    </div>
    <Button variant="secondary" fullWidth onClick={onViewAgenda} className="justify-between">
      <span className="flex items-center gap-2">
        <Calendar className="h-[18px] w-[18px] text-brand-text" aria-hidden="true" /> Ver Agenda Individual
      </span>
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Button>
  </Card>
  );
};
