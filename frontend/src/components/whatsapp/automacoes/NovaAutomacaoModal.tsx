'use client';

import { Button, Icon, Modal } from '@/components/ui';
import type { Regra, RegraDto } from '@/lib/whatsappAutomacoes';

interface NovaAutomacaoModalProps {
  regras: RegraDto[];
  aberto: boolean;
  /** Título, descrição e ícone de cada regra (os mesmos dos cartões). */
  descrever(r: RegraDto): { titulo: string; descricao: string; icone: string };
  onFechar(): void;
  onAtivar(regra: Regra): void;
}

/** As regras desligadas, cada uma com "Ativar". */
export function NovaAutomacaoModal({ regras, aberto, descrever, onFechar, onAtivar }: NovaAutomacaoModalProps) {
  const desligadas = regras.filter((r) => !r.ativa);
  return (
    <Modal
      isOpen={aberto}
      onClose={onFechar}
      title="Nova automação"
      icon="add"
      description="Escolha uma automação para ligar. Você ajusta o texto e o horário em Configurar regra."
      size="lg"
      telaCheiaNoCelular
    >
      {desligadas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Icon name="check_circle" size={32} className="text-whatsapp" />
          <p className="text-[15px] text-muted">Todas as automações já estão ativas</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {desligadas.map((r) => {
            const { titulo, descricao, icone } = descrever(r);
            return (
              <li key={r.regra} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-whatsapp/12 text-whatsapp" aria-hidden="true">
                  <Icon name={icone} size={20} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold text-ink">{titulo}</span>
                  <span className="text-[13px] leading-5 text-muted">{descricao}</span>
                </div>
                <Button variant="whatsapp" size="sm" aria-label={`Ativar ${titulo}`} onClick={() => onAtivar(r.regra)}>
                  Ativar
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
