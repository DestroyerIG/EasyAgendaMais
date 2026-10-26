'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Field, Icon, Input, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { buscarRegraComissao, salvarRegraComissao } from '@/lib/comanda';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { useVocabulario } from '@/hooks/useVocabulario';

export function ComissaoPadraoSection() {
  const { prof } = useVocabulario();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [servico, setServico] = useState('');
  const [produto, setProduto] = useState('');

  useEffect(() => {
    let ativo = true;
    buscarRegraComissao()
      .then(r => {
        if (!ativo) return;
        setServico(String(r.serviceCommissionPct));
        setProduto(String(r.productCommissionPct));
      })
      .catch((error: unknown) => showToast(getApiErrorMessage(error, 'Não foi possível carregar a comissão padrão.'), 'error'))
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, [showToast]);

  const salvar = async () => {
    const s = parseFloat(servico);
    const p = parseFloat(produto);
    if (Number.isNaN(s) || Number.isNaN(p) || s < 0 || s > 100 || p < 0 || p > 100) {
      showToast('Informe percentuais entre 0 e 100.', 'error');
      return;
    }
    setSaving(true);
    try {
      await salvarRegraComissao({ serviceCommissionPct: s, productCommissionPct: p });
      showToast('Comissão padrão salva.', 'success');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível salvar a comissão.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Comissão padrão</h2>
        <p className="mt-1 text-[15px] text-muted">
          Usada na divisão do repasse de cada comanda. {`Cada ${prof.s} pode ter a própria regra no cadastro.`}
        </p>
      </div>
      {loading ? (
        <Skeleton className="h-11 w-full" label="Carregando..." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="comissao-servicos" label="% sobre serviços">
            <Input id="comissao-servicos" type="number" min={0} max={100} step="0.01" value={servico} onChange={e => setServico(e.target.value)} />
          </Field>
          <Field id="comissao-produtos" label="% sobre produtos">
            <Input id="comissao-produtos" type="number" min={0} max={100} step="0.01" value={produto} onChange={e => setProduto(e.target.value)} />
          </Field>
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={salvar} loading={saving} disabled={loading}>
          {!saving && <Icon name="save" size={18} />} Salvar comissão
        </Button>
      </div>
    </Card>
  );
}
