'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Field, Icon, Input, Select, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { buscarCrmSettings, salvarCrmSettings } from '@/lib/crm';
import { parseValorBR } from '@/lib/formatters';
import { SEGMENTOS, type Segmento } from '@/lib/technicalSheetTemplates';
import { getApiErrorMessage } from '@/utils/handleApiError';

const formatarMeta = (valor: number | null) =>
  valor === null ? '' : valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Ajustes do CRM: segmento do negócio (campos da ficha técnica) e meta de faturamento diária. */
export function CrmSettingsSection() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [segmento, setSegmento] = useState<Segmento>('outro');
  const [meta, setMeta] = useState('');
  const [erroMeta, setErroMeta] = useState<string | undefined>();

  useEffect(() => {
    let ativo = true;
    buscarCrmSettings()
      .then((s) => {
        if (!ativo) return;
        setSegmento(s.segment);
        setMeta(formatarMeta(s.dailyRevenueGoal));
      })
      .catch((error: unknown) => showToast(getApiErrorMessage(error, 'Não foi possível carregar os ajustes do CRM.'), 'error'))
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, [showToast]);

  const salvar = async () => {
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
          O segmento ajusta a ficha técnica das clientes; a meta aparece no faturamento da tela Hoje.
        </p>
      </div>
      {loading ? (
        <Skeleton className="h-11 w-full" label="Carregando..." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="crm-segmento" label="Segmento do negócio" hint="Define os campos sugeridos da ficha técnica">
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
        <Button onClick={salvar} loading={saving} disabled={loading}>
          {!saving && <Icon name="save" size={18} />} Salvar
        </Button>
      </div>
    </Card>
  );
}
