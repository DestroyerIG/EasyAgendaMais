'use client';

import { useEffect, useState } from 'react';
import { businessPublicPageApi } from '@/lib/businessPublicPage';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { Banner, Card, Skeleton, Switch } from '@/components/ui';

// Ajustes › Recebimentos: liga o robô do WhatsApp para cobrar o sinal. Precisa da chave Pix salva.
export function SinalNoRoboCard() {
  const [carregado, setCarregado] = useState(false);
  const [temChave, setTemChave] = useState(false);
  const [ligado, setLigado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    businessPublicPageApi.getSettings()
      .then((d) => {
        if (!ativo) return;
        setTemChave(!!d.pixKey);
        setLigado(!!d.botCobraSinal);
      })
      .catch((err) => { if (ativo) setErro(getApiErrorMessage(err, 'Não foi possível carregar esta configuração.')); })
      .finally(() => { if (ativo) setCarregado(true); });
    return () => { ativo = false; };
  }, []);

  const alternar = async (novo: boolean) => {
    setErro(null);
    setLigado(novo);
    setSalvando(true);
    try {
      const d = await businessPublicPageApi.updateSettings({ botCobraSinal: novo });
      setLigado(!!d.botCobraSinal);
    } catch (err) {
      setLigado(!novo);
      setErro(getApiErrorMessage(err, 'Não foi possível salvar. Tente novamente.'));
    } finally {
      setSalvando(false);
    }
  };

  if (!carregado) return <Skeleton className="h-24 w-full" label="Carregando cobrança pelo WhatsApp..." />;

  return (
    <Card className="flex flex-col gap-2.5">
      <Switch
        label="Cobrar o sinal pelo WhatsApp"
        description="O robô passa a cobrar o sinal dos serviços que têm sinal configurado, usando a forma de pagamento padrão do negócio, e confirma o horário depois do pagamento."
        checked={ligado}
        onCheckedChange={alternar}
        disabled={salvando || (!temChave && !ligado)}
      />
      {!temChave && !ligado && <p className="text-[13px] text-muted">Cadastre a chave Pix acima para ativar.</p>}
      {erro && <Banner tone="danger" variant="inline">{erro}</Banner>}
    </Card>
  );
}
