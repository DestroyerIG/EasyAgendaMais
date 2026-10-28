'use client';

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { contaApi, type EstadoConta } from '@/lib/conta';
import { isPublicAuthPath } from '@/lib/publicRoutes';
import type { PlanId } from '@/lib/plans';
import type { User } from '@/types';
import { resolveAuthConfirmRedirectUrl } from '@/lib/supabase/client';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, options?: AuthRedirectOptions) => Promise<void>;
  register: (data: RegisterData, options?: AuthRedirectOptions) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<User | null>;
}

interface AuthRedirectOptions {
  redirectTo?: string;
}

interface RegisterData {
  businessName: string;
  ownerName: string;
  email: string;
  whatsapp: string;
  cpfCnpj: string;
  password: string;
  desiredPlan?: PlanId;
}

interface RegisterResult {
  verificationRequired: boolean;
  verificationEmailSent: boolean;
  message: string;
  email: string;
}

interface RegisterApiPayload {
  verificationRequired?: boolean;
  verificationEmailSent?: boolean;
  message?: string;
  user?: {
    email?: string;
  };
}

const resolvePostAuthRoute = (role: string | undefined, redirectTo?: string) => {
  if (role === 'platform_admin') {
    return '/admin';
  }
  // A profissional só usa o app da bancada (fase 5); o painel é da dona e da recepção.
  if (role === 'professional') {
    return redirectTo?.startsWith('/bancada') ? redirectTo : '/bancada';
  }

  return redirectTo || '/dashboard';
};

const ACCESS_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

const hasPaymentEvidence = (billingStatus: Record<string, unknown>): boolean => {
  const status = typeof billingStatus.subscriptionStatus === 'string'
    ? billingStatus.subscriptionStatus
    : null;

  // Backend explicitly says payment is required — respect it regardless of status
  if (billingStatus.paymentRequired === true) {
    return false;
  }

  // active or trialing without paymentRequired flag = access granted
  return ACCESS_SUBSCRIPTION_STATUSES.has(status || '');
};

// Contingência: quem já pagou e está em carência ou bloqueada vai para a tela da assinatura
// (o /pagamento é o checkout do onboarding e, no cartão, criaria uma segunda assinatura).
// Só quem nunca pagou (bloqueada por teste) segue a regra do billing abaixo.
const rotaPeloEstadoDaConta = async (redirectTo?: string): Promise<string | null> => {
  let estado: EstadoConta;
  try {
    estado = await contaApi.estado();
  } catch {
    return null; // Sem o estado, cai na regra antiga.
  }
  if (estado.tipo === 'ativa') return redirectTo || '/dashboard';
  if (estado.tipo === 'carencia' || estado.motivo !== 'teste') return '/dashboard/assinatura';
  return null;
};

export const resolveTenantPostLoginRoute = async (redirectTo?: string) => {
  const peloEstado = await rotaPeloEstadoDaConta(redirectTo);
  if (peloEstado) return peloEstado;

  try {
    const response = await api.get('/billing/status');
    const billingStatus = response.data as Record<string, unknown>;

    const subscription_status = billingStatus?.subscriptionStatus;
    const paymentRequired = billingStatus?.paymentRequired;
    const evidence = billingStatus && typeof billingStatus === 'object'
      ? hasPaymentEvidence(billingStatus)
      : false;

    console.log('[auth] post-login billing check', {
      subscription_status,
      paymentRequired,
      hasPaymentEvidence: evidence,
      redirectTo,
      currentRoute: typeof window !== 'undefined' ? window.location.pathname : null,
    });

    const desiredPlan = typeof billingStatus?.desiredPlan === 'string'
      ? billingStatus.desiredPlan
      : null;
    const paymentPath = desiredPlan
      ? `/pagamento?plan=${encodeURIComponent(desiredPlan)}`
      : '/pagamento';

    if (!billingStatus || typeof billingStatus !== 'object' || !evidence) {
      console.log('[auth] redirecting to payment', {
        paymentPath,
        reason: !billingStatus ? 'no_billing_data' : 'no_payment_evidence',
        subscription_status,
        paymentRequired,
      });
      return paymentPath;
    }
  } catch (err) {
    // Don't gate dashboard access on API failure — let /dashboard handle SUBSCRIPTION_REQUIRED
    console.error('[auth] billing/status failed during post-login route resolution — falling through to dashboard', err);
    return redirectTo || '/dashboard';
  }

  console.log('[auth] redirecting to dashboard', { redirectTo });
  return redirectTo || '/dashboard';
};

const isUser = (value: unknown): value is User => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<User>;
  return (
    typeof candidate.email === 'string' &&
    typeof candidate.role === 'string' &&
    typeof candidate.businessName === 'string' &&
    typeof candidate.plan === 'string'
  );
};

const extractUserFromResponse = (data: unknown): User | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const payload = data as Record<string, unknown>;

  if (isUser(payload.user)) {
    return payload.user;
  }

  if (isUser(data)) {
    return data;
  }

  return null;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const isPublicRoute = isPublicAuthPath(pathname || '/');

  const refreshMe = useCallback(async (): Promise<User | null> => {
    try {
      const response = await api.get('/auth/me');
      const resolvedUser = extractUserFromResponse(response.data);
      setUser(resolvedUser);
      return resolvedUser;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    if (isPublicRoute) {
      setUser(null);
      setLoading(false);

      return () => {
        mounted = false;
      };
    }

    const initAuth = async () => {
      try {
        const response = await api.get('/auth/me');
        if (!mounted) return;

        setUser(extractUserFromResponse(response.data));
      } catch {
        if (!mounted) return;
        setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    return () => {
      mounted = false;
    };
  }, [isPublicRoute]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onSessionExpired = () => {
      setUser(null);
      setLoading(false);
    };

    window.addEventListener('auth:session-expired', onSessionExpired);
    return () => {
      window.removeEventListener('auth:session-expired', onSessionExpired);
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string, options?: AuthRedirectOptions) => {
      setLoading(true);

      try {
        const response = await api.post('/auth/login', { email, password });
        const doLogin = extractUserFromResponse(response.data);
        // O login não traz o onboarding nem o vocabulário (fase 6): a dona carrega o /auth/me completo.
        const userData = doLogin && doLogin.role !== 'tenant_admin' ? doLogin : (await refreshMe()) ?? doLogin;

        if (!userData) {
          throw new Error('Sessão não foi carregada após o login.');
        }

        setUser(userData);
        const postAuthRoute = userData.role === 'platform_admin' || userData.role === 'professional'
          ? resolvePostAuthRoute(userData.role, options?.redirectTo)
          : await resolveTenantPostLoginRoute(userData.onboarding?.bloqueante ? '/onboarding' : options?.redirectTo);

        const currentPath = typeof window !== 'undefined' ? window.location.pathname : null;
        console.log('[auth] auth_guard_decision', {
          resolved_route: postAuthRoute,
          current_pathname: currentPath,
        });

        if (currentPath === postAuthRoute) {
          console.log('[auth] redirect skipped same route', { route: postAuthRoute });
          return;
        }

        console.log('[auth] redirect executing', { to: postAuthRoute });
        router.replace(postAuthRoute);
        router.refresh();
      } catch (error) {
        setUser(null);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [refreshMe, router]
  );

  const register = useCallback(
    async (data: RegisterData, options?: AuthRedirectOptions): Promise<RegisterResult> => {
      void options;
      setLoading(true);

      try {
        const response = await api.post('/auth/register', {
          ...data,
          emailRedirectTo: resolveAuthConfirmRedirectUrl(),
        });
        const payload = response.data as RegisterApiPayload;

        setUser(null);

        return {
          verificationRequired: payload.verificationRequired !== false,
          verificationEmailSent: payload.verificationEmailSent === true,
          message:
            payload.message ||
            'Cadastro realizado. Verifique seu e-mail para ativar sua conta antes de fazer login.',
          email: payload.user?.email || data.email,
        };
      } catch (error) {
        setUser(null);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const logout = useCallback(async () => {
    setLoading(true);

    try {
      await api.post('/auth/logout');
    } catch {
      // mantém logout local mesmo se a API falhar
    } finally {
      setUser(null);
      setLoading(false);
      router.replace('/login');
      router.refresh();
    }
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: Boolean(user),
        login,
        register,
        logout,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
