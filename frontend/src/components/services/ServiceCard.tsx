'use client';

import { Clock, DollarSign, Edit2, Trash2 } from 'lucide-react';
import { Card, Icon, IconButton } from '@/components/ui';
import { iconeDoServico } from '@/lib/iconeServico';
import { formatDurationExtenso } from '@/lib/formatters';
import type { Service } from '@/types';

interface ServiceCardProps {
  service: Service;
  onEdit: () => void;
  onDelete: () => void;
}

export const ServiceCard = ({ service, onEdit, onDelete }: ServiceCardProps) => (
  <Card className="flex flex-col gap-4">
    <div className="flex items-start justify-between gap-2">
      <div className="flex h-12 w-12 items-center justify-center rounded-control bg-brand/12 text-brand-text">
        <Icon name={iconeDoServico(service.name)} size={24} />
      </div>
      <div className="flex gap-1">
        <IconButton icon={Edit2} label="Editar serviço" onClick={onEdit} />
        <IconButton icon={Trash2} label="Excluir serviço" onClick={onDelete} />
      </div>
    </div>
    <div>
      <h3 className="text-lg font-bold text-ink">{service.name}</h3>
      <div className="mt-1 flex items-center gap-4 text-[15px] text-muted">
        <span className="flex items-center gap-1.5 tabular-nums">
          <Clock className="h-4 w-4 text-brand-text" aria-hidden="true" /> {formatDurationExtenso(service.duration_minutes)}
        </span>
        <span className="flex items-center gap-1.5 tabular-nums">
          <DollarSign className="h-4 w-4 text-success" aria-hidden="true" /> R$ {parseFloat(service.price.toString()).toFixed(2)}
        </span>
      </div>
    </div>
  </Card>
);
