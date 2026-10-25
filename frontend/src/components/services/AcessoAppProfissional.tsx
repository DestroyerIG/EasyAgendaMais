'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Mail, Smartphone, UserX, UserCheck, XCircle } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionAccess } from '@/hooks/useSubscriptionAccess';
import { equipeApi, rotuloAcesso, type Acesso } from '@/lib/equipe';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';
import { useVocabulario } from '@/hooks/useVocabulario';

// Bloco "Acesso ao app" no cadastro da profissional (fase 5). Só a dona convida e tira o acesso.

const COR_ESTADO: Record<Acesso['estado'], string> = {
  sem_acesso: 'bg-muted/12 text-muted',
  convite_enviado: 'bg-status-confirmed/12 text-status-confirmed',
  convite_vencido: 'bg-warning/12 text-warning-text',
  ativo: 'bg-success/12 text-success-text',
  removido: 'bg-danger/12 text-danger',
};

export function AcessoAppProfissional({ professionalId, ativa = true }: { professionalId: string; ativa?: boolean }) {
  const { user } = useAuth();
  const { canAccess } = useSubscriptionAccess();
  const { showToast } = useToast();
  const { prof } = useVocabulario();
  const [acesso, setAcesso] = useState<Acesso | null>(null);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const dona = user?.role === 'tenant_admin';
  const liberado = canAccess('app_profissional');

  useEffect(() => {
    if (!dona || !liberado) return;
    equipeApi.acessos()
      .then((l) => {
        const a = l.find((x) => x.professionalId === professionalId) ?? null;
        setAcesso(a);
        if (a?.email) setEmail(a.email);
      })
      .catch(() => setAcesso(null));
  }, [dona, liberado, professionalId]);

  if (!dona) return null;

  if (!liberado) {
    return (
      <section className="rounded-card border border-line bg-surface-2 p-4">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <Smartphone className="h-4 w-4 text-brand" aria-hidden="true" /> App {prof.doS}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          Ela vê a agenda, a ficha das clientes e os próprios números no celular. Disponível nos planos Equipe e Salão.
        </p>
        <Link href="/planos/comparar?recurso=app_profissional" className="mt-2 inline-block text-[13px] font-semibold text-brand-text hover:underline">
          Ver planos
        </Link>
      </section>
    );
  }

  const executar = async (acao: () => Promise<Acesso>, sucesso: string) => {
    setOcupado(true);
    try {
      setAcesso(await acao());
      showToast(sucesso, 'success');
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível concluir.'), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const convidar = async () => {
    setOcupado(true);
    try {
      const r = await equipeApi.convidar(professionalId, email.trim());
      setAcesso(r);
      setLink(r.link);
      showToast(r.emailEnviado ? `Convite enviado para ${r.email}` : 'Convite criado. Copie o link e mande para ela.', r.emailEnviado ? 'success' : 'info');
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível enviar o convite.'), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link copiado.', 'success');
    } catch {
      showToast('Não foi possível copiar. Selecione o link e copie.', 'error');
    }
  };

  const estado = acesso?.estado ?? 'sem_acesso';
  const podeConvidar = estado === 'sem_acesso' || estado === 'convite_enviado' || estado === 'convite_vencido';

  return (
    <section className="flex flex-col gap-3 rounded-card border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <Smartphone className="h-4 w-4 text-brand" aria-hidden="true" /> Acesso ao app
        </p>
        <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-semibold', COR_ESTADO[estado])}>{rotuloAcesso(acesso)}</span>
      </div>

      {estado === 'ativo' && <p className="text-[13px] text-muted">Entra com {acesso?.email}.</p>}

      {podeConvidar && ativa && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input type="email" aria-label={`E-mail ${prof.doS}`} placeholder={`E-mail ${prof.dele}`} value={email}
            onChange={(e) => setEmail(e.target.value)} className="flex-1" />
          <Button type="button" variant="secondary" onClick={convidar} loading={ocupado} disabled={!email.includes('@')}>
            <Mail className="h-4 w-4" aria-hidden="true" /> {estado === 'sem_acesso' ? 'Convidar para o app' : 'Reenviar convite'}
          </Button>
        </div>
      )}
      {!ativa && estado === 'sem_acesso' && <p className="text-[13px] text-muted">Reative {prof.oS} para convidar.</p>}

      {link && (
        <div className="flex items-center gap-2 rounded-control bg-surface-2 p-2">
          <input readOnly value={link} aria-label="Link do convite" className="min-w-0 flex-1 bg-transparent text-[12px] text-ink" />
          <Button type="button" size="sm" variant="ghost" onClick={copiar}><Copy className="h-4 w-4" aria-hidden="true" /> Copiar</Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {estado === 'convite_enviado' && (
          <Button type="button" size="sm" variant="ghost" disabled={ocupado}
            onClick={() => executar(() => equipeApi.revogar(professionalId), 'Convite cancelado.')}>
            <XCircle className="h-4 w-4" aria-hidden="true" /> Cancelar convite
          </Button>
        )}
        {estado === 'ativo' && (
          <Button type="button" size="sm" variant="ghost" disabled={ocupado}
            onClick={() => executar(() => equipeApi.remover(professionalId), 'Acesso removido. Ela sai do app na hora.')}>
            <UserX className="h-4 w-4" aria-hidden="true" /> Remover acesso
          </Button>
        )}
        {estado === 'removido' && ativa && (
          <Button type="button" size="sm" variant="secondary" disabled={ocupado}
            onClick={() => executar(() => equipeApi.reativar(professionalId), 'Acesso reativado.')}>
            <UserCheck className="h-4 w-4" aria-hidden="true" /> Reativar acesso
          </Button>
        )}
      </div>
    </section>
  );
}
