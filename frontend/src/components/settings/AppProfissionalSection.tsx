'use client';

import { useEffect, useState } from 'react';
import { Card, Skeleton, Switch } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionAccess } from '@/hooks/useSubscriptionAccess';
import { equipeApi } from '@/lib/equipe';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { useVocabulario } from '@/hooks/useVocabulario';

// Ajustes do app da profissional (fase 5): quem cobra a cliente no fim do atendimento.

export function AppProfissionalSection() {
  const { user } = useAuth();
  const { canAccess } = useSubscriptionAccess();
  const { showToast } = useToast();
  const { prof, adaptar } = useVocabulario();
  const [cobra, setCobra] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);
  const visivel = user?.role === 'tenant_admin' && canAccess('app_profissional');

  useEffect(() => {
    if (!visivel) return;
    equipeApi.configuracao().then((c) => setCobra(c.profissionalCobra)).catch(() => setCobra(false));
  }, [visivel]);

  if (!visivel) return null;

  const alternar = async (valor: boolean) => {
    setSalvando(true);
    setCobra(valor);
    try {
      await equipeApi.salvarConfiguracao(valor);
      showToast(valor ? adaptar('As profissionais podem cobrar pelo app.') : 'A cobrança fica com a recepção.', 'success');
    } catch (e) {
      setCobra(!valor);
      showToast(getApiErrorMessage(e, 'Não foi possível salvar.'), 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-ink">App {prof.doS}</h2>
        <p className="mt-1 text-[15px] text-muted">
          Convide cada profissional pelo cadastro dela em Serviços e equipe.
        </p>
      </div>
      {cobra === null ? (
        <Skeleton className="h-11 w-full" label="Carregando..." />
      ) : (
        <Switch
          checked={cobra}
          onCheckedChange={alternar}
          disabled={salvando}
          label={`${prof.OS} cobra no app`}
          description={cobra
            ? 'Ela escolhe a forma de pagamento, dá desconto e fecha a comanda. O caixa do dia precisa estar aberto pela recepção.'
            : 'Ela monta a comanda e toca em "Enviar para a recepção". A recepção cobra no Caixa, com o selo "Pronta para cobrar".'}
        />
      )}
    </Card>
  );
}
