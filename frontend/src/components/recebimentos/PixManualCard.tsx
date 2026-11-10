'use client';

import { useEffect, useState } from 'react';
import { businessPublicPageApi, type PublicPageSettings } from '@/lib/businessPublicPage';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { Banner, Button, Card, Field, Input, Select, Skeleton } from '@/components/ui';

type TipoChave = NonNullable<PublicPageSettings['pixKeyType']>;

const TIPOS: { value: TipoChave; label: string }[] = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Chave aleatória' },
];

// Ajustes › Recebimentos: a chave Pix do sinal. Sem conta conectada, a confirmação é manual;
// com conta conectada, a chave é a reserva quando a cobrança falha ou o cliente prefere o Pix direto.
export function PixManualCard({ confirmacaoAutomatica = false }: { confirmacaoAutomatica?: boolean }) {
  const [carregado, setCarregado] = useState(false);
  const [salva, setSalva] = useState(false);
  const [chave, setChave] = useState('');
  const [tipo, setTipo] = useState<TipoChave>('telefone');
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    businessPublicPageApi.getSettings()
      .then((d) => {
        if (!ativo) return;
        setChave(d.pixKey ?? '');
        setTipo(d.pixKeyType ?? 'telefone');
        setSalva(!!d.pixKey);
      })
      .catch((err) => { if (ativo) setErro(getApiErrorMessage(err, 'Não foi possível carregar a chave Pix.')); })
      .finally(() => { if (ativo) setCarregado(true); });
    return () => { ativo = false; };
  }, []);

  const salvar = async () => {
    setOk(null);
    setErro(null);
    if (!chave.trim()) {
      setErro('Informe a chave Pix.');
      return;
    }
    setSalvando(true);
    try {
      const d = await businessPublicPageApi.updateSettings({ pixKey: chave.trim(), pixKeyType: tipo });
      setChave(d.pixKey ?? chave.trim());
      setSalva(true);
      setOk('Chave Pix salva.');
    } catch (err) {
      setErro(getApiErrorMessage(err, 'Não foi possível salvar a chave Pix. Tente novamente.'));
    } finally {
      setSalvando(false);
    }
  };

  if (!carregado) return <Skeleton className="h-24 w-full" label="Carregando chave Pix..." />;

  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-[15px] font-bold text-ink">Pix do sinal</h2>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-muted">
          {confirmacaoAutomatica ? 'Reserva' : 'Confirmação manual'}
        </span>
      </div>
      <p className="text-[13px] text-muted">
        {confirmacaoAutomatica
          ? 'Sua conta conectada confirma o sinal sozinha. Se o cliente pagar por esta chave, você confere o Pix e confirma o agendamento manualmente.'
          : 'Só com a chave Pix, a confirmação é manual: o cliente paga o sinal nesta chave e você confere o Pix e confirma o agendamento.'}
      </p>
      {!salva && (
        <Banner tone="warning" variant="inline">Sem a chave Pix, sua página não aceita agendamentos com sinal.</Banner>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field id="pix-manual-tipo" label="Tipo de chave" className="sm:w-40">
          <Select id="pix-manual-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoChave)}>
            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field id="pix-manual-chave" label="Chave Pix" className="min-w-0 sm:flex-1">
          <Input id="pix-manual-chave" value={chave} onChange={(e) => setChave(e.target.value)} />
        </Field>
        <Button type="button" onClick={salvar} loading={salvando} className="self-start sm:self-auto">
          {salvando ? 'Salvando...' : 'Salvar chave Pix'}
        </Button>
      </div>
      {ok && <p className="text-[13px] text-whatsapp">{ok}</p>}
      {erro && <p role="alert" className="text-[13px] text-danger">{erro}</p>}
    </Card>
  );
}
