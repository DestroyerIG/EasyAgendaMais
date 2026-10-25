'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Check, KeyRound, Lock } from 'lucide-react';
import { Button, PasswordInput } from '@/components/ui';
import { conviteApi, type ConvitePublico } from '@/lib/equipe';
import { primeiroNome } from '@/lib/bancada';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';

// Página do convite (fase 5): a profissional cria a senha e já entra no app.

const REGRAS = [
  { texto: 'Pelo menos 8 caracteres', ok: (s: string) => s.length >= 8 },
  { texto: 'Uma letra maiúscula', ok: (s: string) => /[A-Z]/.test(s) },
  { texto: 'Um número', ok: (s: string) => /[0-9]/.test(s) },
];

export function ConviteProfissional({ token }: { token: string }) {
  const [convite, setConvite] = useState<ConvitePublico | null>(null);
  const [indisponivel, setIndisponivel] = useState<string | null>(null);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    conviteApi.ver(token)
      .then(setConvite)
      .catch((e) => setIndisponivel(getApiErrorMessage(e, 'Este convite não está disponível. Peça um novo convite ao salão.')));
  }, [token]);

  const senhaOk = REGRAS.every((r) => r.ok(senha));
  const confere = senha === confirmacao;

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!senhaOk || !confere) return;
    setEnviando(true);
    setErro(null);
    try {
      await conviteApi.aceitar(token, senha);
      // Recarrega para o AuthContext ler a sessão nova a partir dos cookies.
      window.location.assign('/bancada');
    } catch (err) {
      setErro(getApiErrorMessage(err, 'Não foi possível criar seu acesso. Tente de novo.'));
      setEnviando(false);
    }
  };

  return (
    <div className="app-theme flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element -- ícone estático */}
        <img src="/icons/icon-192.png" alt="EasyAgenda+" className="mx-auto h-14 w-14 rounded-2xl" />

        {indisponivel ? (
          <section className="mt-6 rounded-card border border-line bg-surface p-6 text-center">
            <Lock className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
            <h1 className="mt-3 text-lg font-bold text-ink">Convite indisponível</h1>
            <p className="mt-2 text-[14px] text-muted">{indisponivel}</p>
            <Link href="/login" className="mt-4 inline-block text-[14px] font-semibold text-brand-text hover:underline">Já tenho acesso: entrar</Link>
          </section>
        ) : !convite ? (
          <p className="mt-6 text-center text-muted">Carregando convite...</p>
        ) : (
          <form onSubmit={entrar} className="mt-6 flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
            <div>
              <h1 className="text-xl font-bold text-ink">
                {primeiroNome(convite.profissional)}, o {convite.negocio} te convidou para o EasyAgenda+
              </h1>
              <p className="mt-1 text-[14px] text-muted">
                Crie sua senha para ver sua agenda, suas clientes e seus números no celular.
              </p>
            </div>
            <p className="rounded-control bg-surface-2 px-3 py-2 text-[14px] text-ink">
              <span className="text-muted">E-mail: </span>{convite.email}
            </p>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
              Senha
              <PasswordInput value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" autoFocus />
            </label>
            <ul className="flex flex-col gap-1 text-[12px]">
              {REGRAS.map((r) => (
                <li key={r.texto} className={cn('flex items-center gap-1.5', r.ok(senha) ? 'text-success-text' : 'text-muted')}>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> {r.texto}
                </li>
              ))}
            </ul>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
              Confirme a senha
              <PasswordInput value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="new-password"
                toggleLabel="confirmação" invalid={confirmacao.length > 0 && !confere} />
            </label>
            {confirmacao.length > 0 && !confere && <p className="text-[12px] text-danger">As senhas não conferem.</p>}
            {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
            <Button type="submit" size="lg" fullWidth loading={enviando} disabled={!senhaOk || !confere}>
              <KeyRound className="h-4 w-4" aria-hidden="true" /> Entrar
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
