'use client';

import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Card, Field, Icon, Input, Select, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { buscarCrmSettings, salvarCrmSettings } from '@/lib/crm';
import { parseValorBR } from '@/lib/formatters';
import { SEGMENTOS, type Segmento } from '@/lib/technicalSheetTemplates';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { useAuth } from '@/contexts/AuthContext';

const formatarMeta = (valor: number | null) =>
  valor === null ? '' : valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Ajustes do CRM: segmento do negócio (campos da ficha técnica) e meta de faturamento diária. */
export function CrmSettingsSection() {
  const { showToast } = useToast();
  const { refreshMe } = useAuth();
  const [loading, setLoading] = useState(true);
  const [segmentoSalvo, setSegmentoSalvo] = useState<Segmento>('outro');
  const [saving, setSaving] = useState(false);
  const [segmento, setSegmento] = useState<Segmento>('outro');
  const [meta, setMeta] = useState('');
  const [erroMeta, setErroMeta] = useState<string | undefined>();
  // Sem os valores reais carregados, salvar gravaria os padrões por cima deles: os campos
  // somem e o "Salvar" fica desligado até a carga dar certo.
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const carregar = useCallback(async (ativo: () => boolean = () => true) => {
    setLoading(true);
    setErroCarga(null);
    try {
      const s = await buscarCrmSettings();
      if (!ativo()) return;
      setSegmento(s.segment);
      setSegmentoSalvo(s.segment);
      setMeta(formatarMeta(s.dailyRevenueGoal));
    } catch (error: unknown) {
      if (ativo()) setErroCarga(getApiErrorMessage(error, 'Não foi possível carregar os ajustes do CRM.'));
    } finally {
      if (ativo()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    carregar(() => ativo);
    return () => { ativo = false; };
  }, [carregar]);

  const salvar = async () => {
    if (erroCarga) return;
    // Vazio remove a meta; qualquer outra coisa precisa ser um valor em reais.
    const texto = meta.trim();
    const dailyRevenueGoal = texto === '' ? null : parseValorBR(texto);
    if (texto !== '' && (dailyRevenueGoal === null || dailyRevenueGoal <= 0)) {
      setErroMeta('Informe a meta em reais, por exemplo 1.800,00.');
      return;
    }
    setErroMeta(undefined);
    setSaving(true);
    try {
      const salvo = await salvarCrmSettings({ segment: segmento, dailyRevenueGoal });
      setSegmento(salvo.segment);
      setMeta(formatarMeta(salvo.dailyRevenueGoal));
      // O segmento muda os termos do painel (fase 6): a sessão recarrega o vocabulário.
      if (salvo.segment !== segmentoSalvo) await refreshMe();
      setSegmentoSalvo(salvo.segment);
      showToast('Ajustes do CRM salvos.', 'success');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível salvar os ajustes do CRM.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Clientes e metas</h2>
        <p className="mt-1 text-[15px] text-muted">
          O segmento ajusta os termos do painel, a ficha técnica e as mensagens padrão; a meta aparece no faturamento da tela Hoje.
        </p>
      </div>
      {loading ? (
        <Skeleton className="h-11 w-full" label="Carregando..." />
      ) : erroCarga ? (
        <Banner
          tone="danger"
          variant="inline"
          action={
            <Button variant="secondary" size="sm" onClick={() => carregar()}>
              Tentar de novo
            </Button>
          }
        >
          <span className="flex-1 text-[14px] text-ink">{erroCarga}</span>
        </Banner>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="crm-segmento"
            label="Segmento do negócio"
            hint={segmento !== segmentoSalvo
              ? 'Ao salvar, mudam os termos do painel e da sua página (ex.: barbeiro, nail designer), a ficha técnica e as mensagens padrão do WhatsApp.'
              : 'Define os termos do painel e os campos da ficha técnica'}
          >
            <Select id="crm-segmento" value={segmento} onChange={(e) => setSegmento(e.target.value as Segmento)}>
              {(Object.keys(SEGMENTOS) as Segmento[]).map((s) => (
                <option key={s} value={s}>{SEGMENTOS[s].rotulo}</option>
              ))}
            </Select>
          </Field>
          <Field id="crm-meta" label="Meta de faturamento diária" hint="Deixe vazio para não usar meta" error={erroMeta}>
            <Input
              id="crm-meta"
              inputMode="decimal"
              placeholder="R$ 0,00"
              value={meta}
              invalid={Boolean(erroMeta)}
              onChange={(e) => setMeta(e.target.value)}
            />
          </Field>
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={salvar} loading={saving} disabled={loading || Boolean(erroCarga)}>
          {!saving && <Icon name="save" size={18} />} Salvar
        </Button>
      </div>
    </Card>
  );
}
