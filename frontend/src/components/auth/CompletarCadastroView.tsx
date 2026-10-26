'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { SAAS_PLANS, isPlanId, type PlanId } from '@/lib/plans';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { formatCpfCnpj, isValidCpfCnpj, normalizeCpfCnpjDigits } from '@/utils/cpfCnpj';
import { destinoAposConfirmar } from './AuthConfirmView';
import { CHAVE_OAUTH_COMPLETAR } from './OAuthCallbackView';

// Conta nova pelo Google (fase 7): os dados do cadastro, sem e-mail (vem do Google) e sem senha.
export function CompletarCadastroView() {
  const router = useRouter();
  const { showToast } = useToast();
  const { refreshMe } = useAuth();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [form, setForm] = useState({ businessName: '', ownerName: '', whatsapp: '', cpfCnpj: '' });
  const [plano, setPlano] = useState<PlanId>('basico');
  const [erroDoc, setErroDoc] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const iniciou = useRef(false);

  // Lê a sessão do Google uma vez só; o router não é dependência de verdade aqui.
  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!token) {
        router.replace('/cadastro');
        return;
      }
      setAccessToken(token);
      try {
        const salvo = JSON.parse(sessionStorage.getItem(CHAVE_OAUTH_COMPLETAR) || '{}') as { email?: string; nome?: string };
        setEmail(salvo.email ?? data.session?.user?.email ?? '');
        if (salvo.nome) setForm((f) => ({ ...f, ownerName: salvo.nome as string }));
      } catch {
        setEmail(data.session?.user?.email ?? '');
      }
      const daUrl = new URLSearchParams(window.location.search).get('plan');
      if (daUrl && isPlanId(daUrl)) setPlano(daUrl);
    })();
  }, [router]);

  const mudar = (campo: keyof typeof form, valor: string) =>
    setForm((f) => ({ ...f, [campo]: campo === 'cpfCnpj' ? formatCpfCnpj(valor) : valor }));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    const cpfCnpj = normalizeCpfCnpjDigits(form.cpfCnpj);
    if (!cpfCnpj || !isValidCpfCnpj(cpfCnpj)) {
      setErroDoc('CPF/CNPJ inválido. Verifique os dados informados.');
      return;
    }
    setErroDoc(null);
    setEnviando(true);
    try {
      const { data } = await api.post('/auth/oauth/completar', {
        accessToken, businessName: form.businessName, ownerName: form.ownerName,
        whatsapp: form.whatsapp, cpfCnpj, desiredPlan: plano,
      });
      sessionStorage.removeItem(CHAVE_OAUTH_COMPLETAR);
      await refreshMe();
      router.replace(destinoAposConfirmar(data));
    } catch (erro) {
      showToast(getApiErrorMessage(erro, 'Não foi possível criar a conta. Tente de novo.'), 'error');
      setEnviando(false);
    }
  };

  return (
    <div className="app-theme min-h-screen px-4 py-10">
      <Card className="mx-auto w-full max-w-md">
        <h1 className="text-2xl font-bold text-ink">Complete seu cadastro</h1>
        <p className="mt-1 text-sm text-muted">Falta pouco: conte sobre o seu negócio.</p>

        <p className="mt-5 rounded-control bg-surface-2 px-3 py-2 text-[14px] text-ink">
          <span className="text-muted">Conta Google: </span>{email}
        </p>
        <p className="mt-2 text-[13px] text-muted">
          Já tem conta com outro e-mail? Entre com ele.{' '}
          <Link href="/login" className="font-semibold text-brand-text hover:underline">Ir para o login</Link>
        </p>

        <form onSubmit={enviar} method="post" className="mt-5 space-y-4" aria-label="Completar cadastro">
          <Field id="completar-negocio" label="Nome do negócio">
            <Input id="completar-negocio" value={form.businessName} onChange={(e) => mudar('businessName', e.target.value)} required />
          </Field>
          <Field id="completar-nome" label="Nome do responsável">
            <Input id="completar-nome" value={form.ownerName} onChange={(e) => mudar('ownerName', e.target.value)} required />
          </Field>
          <Field id="completar-whatsapp" label="WhatsApp">
            <Input id="completar-whatsapp" type="tel" value={form.whatsapp} onChange={(e) => mudar('whatsapp', e.target.value)} required />
          </Field>
          <Field id="completar-doc" label="CPF/CNPJ" error={erroDoc ?? undefined}>
            <Input
              id="completar-doc" value={form.cpfCnpj} onChange={(e) => mudar('cpfCnpj', e.target.value)}
              placeholder="Digite o CPF ou CNPJ" maxLength={18} required invalid={Boolean(erroDoc)}
            />
          </Field>
          <Field id="completar-plano" label="Plano">
            <Select id="completar-plano" value={plano} onChange={(e) => setPlano(e.target.value as PlanId)}>
              {SAAS_PLANS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Button type="submit" fullWidth size="lg" loading={enviando} disabled={!accessToken}>
            Criar conta
          </Button>
        </form>
      </Card>
    </div>
  );
}
