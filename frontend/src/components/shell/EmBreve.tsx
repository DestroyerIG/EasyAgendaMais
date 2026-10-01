import { Icon } from '@/components/ui';

export interface EmBreveProps {
  icon: string;
  titulo: string;
  descricao: string;
}

// Placeholder das telas ainda sem tela real (Clube e pacotes, Relatórios, Minha
// página): centralizado na área de conteúdo, dentro do AppShell de sempre.
export function EmBreve({ icon, titulo, descricao }: EmBreveProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 py-16 text-center">
      <Icon name={icon} size={40} className="text-muted" />
      <h1 className="text-2xl font-bold text-ink">{titulo}</h1>
      <p className="max-w-sm text-muted">{descricao}</p>
    </div>
  );
}
