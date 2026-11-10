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

// Ajustes › Recebimentos: a chave Pix do sinal manual. Vale sem gateway e é a reserva quando
// a cobrança automática falha ou o cliente prefere o Pix direto.
export function PixManualCard() {
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

  if (!carregado) return <Skeleton className="h-40 w-full" label="Carregando chave Pix..." />;

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold text-ink">Pix do sinal</h2>
        <p className="mt-1 text-[15px] text-muted">
          O cliente paga o sinal direto nesta chave e você confere o Pix. Com uma conta conectada abaixo,
          ela continua valendo como reserva.
        </p>
      </div>
      {!salva && (
        <Banner tone="warning" variant="inline">Sem a chave Pix, sua página não aceita agendamentos com sinal.</Banner>
      )}
      <Field id="pix-manual-tipo" label="Tipo de chave">
        <Select id="pix-manual-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoChave)}>
          {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      </Field>
      <Field id="pix-manual-chave" label="Chave Pix">
        <Input id="pix-manual-chave" value={chave} onChange={(e) => setChave(e.target.value)} />
      </Field>
      {ok && <p className="text-sm text-whatsapp">{ok}</p>}
      {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
      <Button type="button" onClick={salvar} loading={salvando} className="self-start">
        {salvando ? 'Salvando...' : 'Salvar chave Pix'}
      </Button>
    </Card>
  );
}
