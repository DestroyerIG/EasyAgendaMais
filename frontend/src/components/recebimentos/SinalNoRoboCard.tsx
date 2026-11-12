'use client';

import { useEffect, useState } from 'react';
import { businessPublicPageApi } from '@/lib/businessPublicPage';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { Banner, Button, Card, Field, Input, Skeleton, Switch } from '@/components/ui';

// Ajustes › Recebimentos: liga a cobrança do sinal (página pública e robô do WhatsApp) e define o sinal geral.
// O serviço com porcentagem própria no cadastro (inclusive 0) prevalece; o sem porcentagem usa a geral.
// Precisa da chave Pix salva.
export function SinalNoRoboCard() {
  const [carregado, setCarregado] = useState(false);
  const [temChave, setTemChave] = useState(false);
  const [ligado, setLigado] = useState(false);
  const [pctSalva, setPctSalva] = useState<number | null>(null);
  const [pct, setPct] = useState('');
  const [abrindo, setAbrindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    businessPublicPageApi.getSettings()
      .then((d) => {
        if (!ativo) return;
        setTemChave(!!d.pixKey);
        setLigado(!!d.botCobraSinal);
        setPctSalva(d.sinalPadraoPct ?? null);
        setPct(d.sinalPadraoPct != null ? String(d.sinalPadraoPct) : '');
      })
      .catch((err) => { if (ativo) setErro(getApiErrorMessage(err, 'Não foi possível carregar esta configuração.')); })
      .finally(() => { if (ativo) setCarregado(true); });
    return () => { ativo = false; };
  }, []);

  const salvar = async (dados: { botCobraSinal: boolean; sinalPadraoPct?: number }, mensagem: string) => {
    setErro(null);
    setOk(null);
    setSalvando(true);
    try {
      const d = await businessPublicPageApi.updateSettings(dados);
      setLigado(!!d.botCobraSinal);
      setPctSalva(d.sinalPadraoPct ?? null);
      setPct(d.sinalPadraoPct != null ? String(d.sinalPadraoPct) : '');
      setAbrindo(false);
      setOk(mensagem);
    } catch (err) {
      setErro(getApiErrorMessage(err, 'Não foi possível salvar. Tente novamente.'));
    } finally {
      setSalvando(false);
    }
  };

  const alternar = (novo: boolean) => {
    setOk(null);
    setErro(null);
    if (!novo) {
      setAbrindo(false);
      void salvar({ botCobraSinal: false }, 'Cobrança do sinal desligada.');
    } else if (pctSalva) {
      void salvar({ botCobraSinal: true }, 'Cobrança do sinal ligada.');
    } else {
      setAbrindo(true); // liga de verdade ao salvar a porcentagem
    }
  };

  const salvarPorcentagem = () => {
    const n = Number(pct.replace(',', '.'));
    if (!Number.isFinite(n) || n < 1 || n > 100) {
      setErro('Informe uma porcentagem entre 1 e 100.');
      return;
    }
    void salvar({ botCobraSinal: true, sinalPadraoPct: n }, 'Sinal geral salvo.');
  };

  if (!carregado) return <Skeleton className="h-24 w-full" label="Carregando cobrança do sinal..." />;

  const mostrarCampo = ligado || abrindo;

  return (
    <Card className="flex flex-col gap-2.5">
      <Switch
        label="Cobrar sinal nas reservas"
        description="Cobra o sinal na página de agendamento e pelo robô do WhatsApp, usando a forma de pagamento padrão do negócio, e confirma o horário depois do pagamento. Serviço com porcentagem própria mantém a dele; serviço sem porcentagem usa o sinal geral abaixo."
        checked={mostrarCampo}
        onCheckedChange={alternar}
        disabled={salvando || (!temChave && !mostrarCampo)}
      />
      {!temChave && !mostrarCampo && <p className="text-[13px] text-muted">Cadastre a chave Pix acima para ativar.</p>}
      {mostrarCampo && (
        <div className="flex flex-col gap-2.5">
          <Field id="sinal-padrao-pct" label="Sinal geral (%)" hint="Ex.: 30 cobra 30% do valor do serviço. No cadastro do serviço, 0 faz aquele serviço não pedir sinal.">
            <Input
              id="sinal-padrao-pct"
              type="number"
              min={1}
              max={100}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="30"
            />
          </Field>
          <div>
            <Button type="button" onClick={salvarPorcentagem} loading={salvando}>Salvar sinal</Button>
          </div>
        </div>
      )}
      {ok && <p role="status" className="text-[13px] text-success-text">{ok}</p>}
      {erro && <Banner tone="danger" variant="inline">{erro}</Banner>}
    </Card>
  );
}
