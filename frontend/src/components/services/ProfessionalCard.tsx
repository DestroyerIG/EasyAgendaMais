'use client';

import { Calendar, ChevronRight, Edit2, Trash2 } from 'lucide-react';
import { Card, Avatar, IconButton, Button } from '@/components/ui';
import type { Professional } from '@/types';

interface ProfessionalCardProps {
  professional: Professional;
  onEdit: () => void;
  onDelete: () => void;
  onViewAgenda: () => void;
}

export const ProfessionalCard = ({ professional, onEdit, onDelete, onViewAgenda }: ProfessionalCardProps) => (
  <Card className="flex flex-col gap-4">
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-4">
        <Avatar name={professional.name} src={professional.photo} size={56} />
        <div>
          <h3 className="text-lg font-bold text-ink">{professional.name}</h3>
          <p className="text-[13px] font-semibold text-brand-text">Profissional</p>
        </div>
      </div>
      <div className="flex gap-1">
        <IconButton icon={Edit2} label="Editar profissional" onClick={onEdit} />
        <IconButton icon={Trash2} label="Excluir profissional" onClick={onDelete} />
      </div>
    </div>
    <Button variant="secondary" fullWidth onClick={onViewAgenda} className="justify-between">
      <span className="flex items-center gap-2">
        <Calendar className="h-[18px] w-[18px] text-brand-text" aria-hidden="true" /> Ver Agenda Individual
      </span>
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Button>
  </Card>
);
