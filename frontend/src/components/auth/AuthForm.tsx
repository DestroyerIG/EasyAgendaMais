'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { Banner, BrandLogo, Button, Card, Field, Input, PasswordInput } from '@/components/ui';
import api from '@/lib/api';
import { getApiErrorCode, getApiErrorMessage } from '@/utils/handleApiError';
import { formatCpfCnpj, isValidCpfCnpj, normalizeCpfCnpjDigits } from '@/utils/cpfCnpj';
import { resolveAuthConfirmRedirectUrl } from '@/lib/supabase/client';
import { guardarSegmentoDoCadastro } from '@/lib/onboarding';
import { guardarEscolhaTeste, type EscolhaTeste } from '@/lib/escolhaTeste';
import { trackCadastroConcluido } from '@/lib/metaPixel';
import { BotaoGoogle } from './BotaoGoogle';
import { TelaCarregandoPainel } from './TelaCarregandoPainel';

type AuthMode = 'login' | 'register';

interface AuthFormProps {
  mode: AuthMode;
}

const isTimeoutError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;
  if (err.code === 'ECONNABORTED') return true;
  if (err.code === 'ERR_NETWORK') return true;
  if (typeof err.message === 'string' && err.message.toLowerCase().includes('timeout')) return true;
  return false;
};

export function AuthForm({ mode }: AuthFormProps) {
  const [loading, setLoading] = useState(false);
  // Login deu certo: a tela de carregamento cobre a espera até o painel abrir.
  const [entrando, setEntrando] = useState(false);
  const [escolhaTeste, setEscolhaTeste] = useState<EscolhaTeste>('sem_cartao');
  const [resendingVerification, setResendingVerification] = useState(false);
  const [showConfirmedNotice, setShowConfirmedNotice] = useState(false);
  const [planoDaUrl, setPlanoDaUrl] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [cpfCnpjValidationError, setCpfCnpjValidationError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    businessName: '',
    ownerName: '',
    whatsapp: '',
    cpfCnpj: '',
  });

  const { login, register } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const isLogin = mode === 'login';

  useEffect(() => {
    if (!isLogin || typeof window === 'undefined') {
      setShowConfirmedNotice(false);
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    setShowConfirmedNotice(searchParams.get('confirmed') === '1');
  }, [isLogin]);

  // Segmento escolhido na landing: pré-marca a etapa 1 do onboarding (fase 6).
  useEffect(() => {
    if (isLogin || typeof window === 'undefined') return;
    guardarSegmentoDoCadastro(new URLSearchParams(window.location.search).get('segmento'));
  }, [isLogin]);

  // O plano escolhido na página de preços acompanha a ida e a volta do Google.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPlanoDaUrl(new URLSearchParams(window.location.search).get('plan'));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === 'cpfCnpj') {
      setFormData((prev) => ({
        ...prev,
        cpfCnpj: formatCpfCnpj(value),
      }));

      if (cpfCnpjValidationError) {
        setCpfCnpjValidationError(null);
      }

      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setVerificationNotice(null);

    try {
      if (isLogin) {
        await login(formData.email, formData.password);
        setEntrando(true);
      } else {
        const normalizedCpfCnpj = normalizeCpfCnpjDigits(formData.cpfCnpj);

        if (!normalizedCpfCnpj) {
          setCpfCnpjValidationError('CPF/CNPJ é obrigatório.');
          showToast('Informe o CPF/CNPJ para concluir o cadastro.', 'error');
          return;
        }

        if (!isValidCpfCnpj(normalizedCpfCnpj)) {
          setCpfCnpjValidationError('CPF/CNPJ inválido. Verifique os dados informados.');
          showToast('CPF/CNPJ inválido. Verifique os dados informados.', 'error');
          return;
        }

        setCpfCnpjValidationError(null);

        const result = await register({
          businessName: formData.businessName,
          ownerName: formData.ownerName,
          email: formData.email,
          whatsapp: formData.whatsapp,
          cpfCnpj: normalizedCpfCnpj,
          password: formData.password,
        });

        // Conversão dos anúncios: conta criada (sem dados pessoais no evento).
        trackCadastroConcluido('email');

        // ✅ Redireciona para tela de verificação após cadastro bem-sucedido
        if (result.verificationRequired) {
          router.push(
            `/verificar-email?email=${encodeURIComponent(result.email || formData.email)}`
          );
          return;
        }

        // Fallback: cadastro sem verificação obrigatória
        showToast(result.message, 'success');
      }
    } catch (error: unknown) {
      const errorCode = getApiErrorCode(error);

      // Login com e-mail não verificado
      if (isLogin && errorCode === 'EMAIL_NOT_VERIFIED') {
        setVerificationEmail(formData.email.trim());
        setVerificationSent(false);
        setVerificationNotice(
          'Sua conta ainda não foi verificada. Reenvie o link e confirme seu e-mail para entrar.'
        );
        showToast(getApiErrorMessage(error, 'Erro ao processar solicitação'), 'error');
        return;
      }

      // Timeout — servidor hibernado (Render free tier)
      if (!isLogin && isTimeoutError(error)) {
        setVerificationEmail(formData.email.trim());
        setVerificationSent(false);
        setVerificationNotice(
          'O servidor demorou para responder. Caso já tenha tentado antes, seu cadastro pode ter sido criado — tente reenviar o e-mail de verificação ou faça login.'
        );
        showToast(
          'Tempo esgotado. Verifique se o cadastro foi criado tentando fazer login ou reenviar a verificação.',
          'info'
        );
        return;
      }

      // E-mail já cadastrado (409)
      if (!isLogin && errorCode === 'CONFLICT') {
        setVerificationEmail(formData.email.trim());
        setVerificationSent(false);
        setVerificationNotice(
          'Este e-mail já possui uma conta cadastrada. Caso não tenha verificado seu e-mail, reenvie o link abaixo.'
        );
        showToast('E-mail já cadastrado.', 'error');
        return;
      }

      showToast(getApiErrorMessage(error, 'Erro ao processar solicitação'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const email = (verificationEmail || formData.email || '').trim();

    if (!email) {
      showToast('Informe o e-mail da conta para reenviar a verificação.', 'error');
      return;
    }

    setResendingVerification(true);

    try {
      const response = await api.post('/auth/resend-verification', {
        email,
        emailRedirectTo: resolveAuthConfirmRedirectUrl(),
      });
      const message =
        typeof response.data?.message === 'string'
          ? response.data.message
          : 'Se existir uma conta pendente para este e-mail, processaremos um novo envio de verificação.';

      setVerificationEmail(email);
      setVerificationSent(true);
      setVerificationNotice(message);
      showToast(message, 'info');
    } catch (error: unknown) {
      showToast(
        getApiErrorMessage(error, 'Não foi possível reenviar o e-mail de verificação.'),
        'error'
      );
    } finally {
      setResendingVerification(false);
    }
  };

  if (entrando) {
    return <TelaCarregandoPainel />;
  }

  return (
    <div className="app-theme min-h-screen px-4 py-8 sm:py-12">
      {/* Duas colunas alinhadas ao topo: o texto acompanha o formulário em vez de ficar
          centralizado na vertical contra um cartão alto (deixava o título fora da tela). */}
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start lg:gap-14">
        <section className="max-w-xl lg:sticky lg:top-12 lg:pt-4">
          <div className="inline-flex items-center gap-3">
            <BrandLogo size={36} priority />
            <p className="text-xs uppercase tracking-[0.24em] text-brand-text">EasyAgenda+</p>
          </div>
          <h1 className="mt-3 text-[1.75rem] font-black leading-tight text-ink sm:text-4xl lg:text-5xl">
            {isLogin
              ? 'Acesse sua operação e mantenha o controle do seu negócio.'
              : 'Agenda cheia, sem cliente faltando.'}
          </h1>
          <p className="mt-3 text-muted lg:mt-4">
            {isLogin
              ? 'Dashboard completo de agendamentos, clientes, financeiro e performance da equipe.'
              : 'Para salão, barbearia, nail designer e clínica de estética: agenda online, lembrete automático no WhatsApp e caixa em um só lugar.'}
          </p>

          {!isLogin && (
            <>
              <ul className="mt-6 hidden space-y-3 text-sm text-ink lg:block">
                {[
                  'Seu cliente agenda sozinho, pelo celular',
                  'O robô confirma e lembra pelo WhatsApp',
                  'Agenda, clientes e financeiro no mesmo lugar',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand-text"
                    >
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-4 py-2 text-sm text-brand-text lg:mt-6">
                Teste grátis: 7 dias sem cartão ou 14 com cartão
              </div>
            </>
          )}
        </section>

        <Card className="mx-auto w-full max-w-md lg:mx-0 lg:ml-auto">
          <div className="mb-6 flex items-center gap-3">
            <BrandLogo size={40} />
            <div>
              <h2 className="text-2xl font-bold text-ink">{isLogin ? 'Login' : 'Criar conta'}</h2>
              <p className="text-sm text-muted">
                {isLogin ? 'Entre para continuar.' : 'Leva menos de 2 minutos.'}
              </p>
            </div>
          </div>

          {isLogin && showConfirmedNotice && (
            <Banner tone="success" variant="inline" className="mb-5 justify-center text-center">
              E-mail confirmado com sucesso. Agora você já pode entrar.
            </Banner>
          )}

          {/* method="post": se o clique cair antes do React hidratar, o navegador ainda não
              tem o onSubmit e envia o form puro — sem isso o padrão HTML é GET para a
              própria URL, o que vazava a senha em texto puro na barra de endereço (achado
              do usuário). */}
          <BotaoGoogle plano={planoDaUrl} />

          <form
            onSubmit={handleSubmit}
            method="post"
            className="space-y-4"
            aria-label={isLogin ? 'Formulário de login' : 'Formulário de cadastro'}
          >
            {!isLogin && (
              <>
                <Field id="register-business-name" label="Nome do negócio">
                  <Input
                    id="register-business-name"
                    type="text"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleChange}
                    required
                  />
                </Field>
                <Field id="register-owner-name" label="Nome do responsável">
                  <Input
                    id="register-owner-name"
                    type="text"
                    name="ownerName"
                    value={formData.ownerName}
                    onChange={handleChange}
                    required
                  />
                </Field>
                <Field id="register-whatsapp" label="WhatsApp">
                  <Input
                    id="register-whatsapp"
                    type="tel"
                    name="whatsapp"
                    value={formData.whatsapp}
                    onChange={handleChange}
                    required
                  />
                </Field>

                <Field id="register-cpf-cnpj" label="CPF/CNPJ" error={cpfCnpjValidationError ?? undefined}>
                  <Input
                    id="register-cpf-cnpj"
                    type="text"
                    name="cpfCnpj"
                    placeholder="Digite o CPF ou CNPJ"
                    value={formData.cpfCnpj}
                    onChange={handleChange}
                    required
                    maxLength={18}
                    invalid={Boolean(cpfCnpjValidationError)}
                  />
                </Field>
              </>
            )}

            <Field id="auth-email" label="Email">
              <Input
                id="auth-email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </Field>

            <Field
              id="auth-password"
              label={isLogin ? 'Senha' : 'Senha (mín. 8 caracteres, maiúscula e número)'}
            >
              <PasswordInput
                id="auth-password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={isLogin ? 1 : 8}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                toggleLabel="senha"
              />
            </Field>

            {isLogin && (
              <div className="-mt-2 text-right">
                <Link href="/esqueci-senha" className="text-xs font-semibold text-brand-text">
                  Esqueceu sua senha?
                </Link>
              </div>
            )}

            {!isLogin && (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-[13px] font-semibold text-ink">Como quer testar?</legend>
                {([
                  ['sem_cartao', 'Testar 7 dias grátis', 'Sem cartão. Entra agora.'],
                  ['com_cartao', 'Testar 14 dias grátis', 'Com cartão cadastrado. A primeira cobrança só acontece no fim do teste; cancele antes e nada é cobrado.'],
                ] as const).map(([valor, titulo, linha]) => (
                  <label
                    key={valor}
                    className={`flex cursor-pointer items-start gap-3 rounded-control border p-3 ${
                      escolhaTeste === valor ? 'border-brand bg-brand/8' : 'border-line bg-surface'
                    }`}
                  >
                    <input
                      type="radio"
                      name="escolha-teste"
                      value={valor}
                      checked={escolhaTeste === valor}
                      onChange={() => {
                        setEscolhaTeste(valor);
                        guardarEscolhaTeste(valor);
                      }}
                      aria-label={titulo}
                      className="mt-1 accent-brand"
                    />
                    <span className="flex flex-col">
                      <span className="text-[14px] font-semibold text-ink">{titulo}</span>
                      <span className="text-[13px] text-muted">{linha}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            <Button type="submit" fullWidth loading={loading} size="lg">
              {loading ? 'Processando...' : isLogin ? 'Entrar' : 'Criar conta'}
            </Button>

            {!isLogin && (
              <p className="text-center text-xs leading-relaxed text-muted">
                Ao criar conta, você concorda com os{' '}
                <Link href="/termos" target="_blank" className="text-brand-text hover:underline">
                  Termos de Uso
                </Link>{' '}
                e a{' '}
                <Link href="/privacidade" target="_blank" className="text-brand-text hover:underline">
                  Política de Privacidade
                </Link>
                .
              </p>
            )}

            {/* Aviso de verificação — aparece só em casos de erro/timeout/conflito */}
            {verificationNotice && (
              <Banner tone="danger" variant="inline" className="flex-col p-4">
                <p>{verificationNotice}</p>
                {verificationEmail && (
                  <p className="mt-2 text-xs text-muted">
                    E-mail: <strong>{verificationEmail}</strong>
                  </p>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={resendingVerification}
                  onClick={handleResendVerification}
                  className="mt-3"
                >
                  {resendingVerification ? 'Reenviando...' : 'Reenviar e-mail de verificação'}
                </Button>
                {verificationSent && (
                  <p className="mt-2 text-xs text-muted">
                    Se não encontrar na caixa de entrada, confira a pasta de spam.
                  </p>
                )}
              </Banner>
            )}

            {!isLogin && (
              <p className="text-xs text-muted">
                O teste é no plano que você escolheu. Com o cartão, você o cadastra logo depois de verificar o e-mail.
              </p>
            )}
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            {isLogin ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
            <Link href={isLogin ? '/cadastro' : '/login'} className="font-semibold text-brand-text">
              {isLogin ? 'Cadastrar-se' : 'Fazer login'}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
