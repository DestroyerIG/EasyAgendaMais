'use client';

import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Banner, Button, Card, Field, Select, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useVocabulario } from '@/hooks/useVocabulario';
import { googleAgendaApi, type EstadoGoogleAgenda, type ParaGoogle, type StatusConexao } from '@/lib/googleAgenda';
import { getApiErrorMessage } from '@/utils/handleApiError';

// Google Agenda (fase 7): a dona conecta em Ajustes, a profissional no app.

const ROTULO_STATUS: Record<StatusConexao, string> = {
  ativa: 'Conectada',
  reconectar: 'Precisa reconectar',
  pausada_plano: 'Pausada pelo plano',
};

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function GoogleAgendaCard({ para }: { para: ParaGoogle }) {
  const { showToast } = useToast();
  const { prof } = useVocabulario();
  const [estado, setEstado] = useState<EstadoGoogleAgenda | null>(null);
  const [indo, setIndo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);

  useEffect(() => {
    googleAgendaApi.conexao().then(setEstado).catch(() => setEstado({ configurado: false, conexao: null }));
  }, []);

  // Volta do Google: ?google=ok|erro. Mostra uma vez e limpa a URL.
  useEffect(() => {
    const resultado = new URLSearchParams(window.location.search).get('google');
    if (!resultado) return;
    if (resultado === 'ok') showToast('Google Agenda conectado.', 'success');
    else showToast('Não foi possível conectar o Google Agenda. Tente de novo.', 'error');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('google');
      window.history.replaceState(null, '', url.toString());
    } catch { /* URL de teste sem href completo */ }
  }, [showToast]);

  if (estado === null) return <Skeleton className="h-28 w-full" label="Carregando Google Agenda..." />;
  if (!estado.configurado) return null;

  const conectar = async () => {
    setIndo(true);
    try {
      const { url } = await googleAgendaApi.conectar(para);
      window.location.assign(url);
    } catch (e) {
      setIndo(false);
      showToast(getApiErrorMessage(e, 'Não foi possível abrir o Google.'), 'error');
    }
  };

  const desconectar = async () => {
    setDesconectando(true);
    try {
      await googleAgendaApi.desconectar();
      setEstado(await googleAgendaApi.conexao());
      showToast('Google Agenda desconectado.', 'success');
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível desconectar.'), 'error');
    } finally {
      setDesconectando(false);
      setConfirmando(false);
    }
  };

  const escolherProfissional = async (valor: string) => {
    try {
      setEstado(await googleAgendaApi.definirProfissional(valor || null));
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível salvar.'), 'error');
    }
  };

  const c = estado.conexao;
  const ehDona = para === 'negocio';
  const explicacao = ehDona
    ? 'Os agendamentos aparecem no seu Google Agenda, numa agenda separada chamada EasyAgenda+. Seus compromissos pessoais bloqueiam o horário na sua página.'
    : 'Seus agendamentos aparecem no seu Google Agenda, numa agenda separada chamada EasyAgenda+. Seus compromissos pessoais bloqueiam o horário na sua página.';

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-brand-text" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-bold text-ink">Google Agenda</h2>
          <p className="mt-1 text-[15px] text-muted">{explicacao}</p>
        </div>
      </div>

      {!c ? (
        <Button onClick={conectar} loading={indo}>Conectar Google Agenda</Button>
      ) : (
        <div className="space-y-4">
          <div className="rounded-control bg-surface-2 px-3 py-2 text-[14px]">
            <p className="font-semibold text-ink">{c.googleEmail}</p>
            <p className="text-muted">
              {c.ultimaSyncEm ? `Última sincronização: ${quando(c.ultimaSyncEm)}` : 'Sincronizando os agendamentos...'}
            </p>
          </div>

          {c.status === 'reconectar' && (
            <Banner tone="warning" variant="inline">
              O Google recusou o acesso e os agendamentos pararam de ir para a agenda.{' '}
              <Button size="sm" variant="secondary" onClick={conectar} loading={indo}>Reconectar</Button>
            </Banner>
          )}
          {c.status === 'pausada_plano' && (
            <Banner tone="info" variant="inline">A conexão está pausada: o plano atual não inclui o app.</Banner>
          )}

          {ehDona && estado.profissionais && estado.profissionais.length > 0 && (
            <Field id="google-quem-atende" label={`Você também atende como ${prof.s}?`}>
              <Select
                id="google-quem-atende"
                value={c.professionalId ?? ''}
                onChange={(e) => escolherProfissional(e.target.value)}
              >
                <option value="">Não atendo</option>
                {estado.profissionais.map((p) => <option key={p.professionalId} value={p.professionalId}>{p.nome}</option>)}
              </Select>
            </Field>
          )}

          {confirmando ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] text-ink">Desconectar o Google Agenda?</span>
              <Button size="sm" variant="danger" onClick={desconectar} loading={desconectando}>Sim, desconectar</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>Cancelar</Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmando(true)}>Desconectar</Button>
          )}
        </div>
      )}

      {ehDona && estado.profissionais && estado.profissionais.length > 1 && (
        <div>
          <h3 className="text-[14px] font-semibold text-ink">{`Google Agenda da equipe`}</h3>
          <ul aria-label="Google Agenda da equipe" className="mt-2 divide-y divide-line">
            {estado.profissionais.map((p) => (
              <li key={p.professionalId} className="flex items-center justify-between py-2 text-[14px]">
                <span className="text-ink">{p.nome}</span>
                <span className="text-muted">{p.status ? ROTULO_STATUS[p.status] : 'Não conectada'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
