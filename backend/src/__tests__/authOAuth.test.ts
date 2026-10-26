import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockQuery = vi.hoisted(() => vi.fn());
const mockRelease = vi.hoisted(() => vi.fn());
const mockClientQuery = vi.hoisted(() => vi.fn());
const mockGetClient = vi.hoisted(() => vi.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockRelease,
}));

vi.mock('../config/database.js', () => ({
  default: { query: mockQuery, end: vi.fn(), connect: vi.fn() },
}));

vi.mock('../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

vi.mock('../services/whatsappClient.js', () => ({
  initWhatsApp: vi.fn(),
  getWhatsAppStatus: vi.fn(),
  getWhatsAppClient: vi.fn(),
  connectWhatsApp: vi.fn(),
  disconnectWhatsApp: vi.fn(),
  getWhatsAppQrCode: vi.fn(),
  sendWhatsAppText: vi.fn(),
  refreshWhatsAppStatus: vi.fn(),
  logoutWhatsApp: vi.fn(),
  restartWhatsApp: vi.fn(),
}));

vi.mock('../services/whatsapp/index.js', () => ({
  handleWebhook: vi.fn(),
  handleIncomingMessage: vi.fn(),
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock('../services/cronService.js', () => ({
  startReminderCron: vi.fn(),
}));

const mockAuthRepository = {
  getClient: mockGetClient,
  findUserByEmail: vi.fn(),
  findUserByEmailIncludingBlocked: vi.fn(),
  findUserBySupabaseUserId: vi.fn(),
  findAnyUserByEmail: vi.fn(),
  findUserByEmailForSync: vi.fn(),
  findUserBySupabaseUserIdForUpdate: vi.fn(),
  findBusinessByEmailForUpdate: vi.fn(),
  findBusinessById: vi.fn(),
  upsertPlatformAdminUser: vi.fn(),
  createBusiness: vi.fn(),
  createUser: vi.fn(),
  upsertPendingRegistration: vi.fn(),
  findPendingRegistrationByEmail: vi.fn(),
  findPendingRegistrationForReconciliation: vi.fn(),
  completePendingRegistration: vi.fn(),
  touchPendingRegistrationVerificationSentAt: vi.fn(),
  markEmailAsVerifiedWithSupabaseIdentity: vi.fn(),
  updateUserIdentitySync: vi.fn(),
  upsertTenantAdminUser: vi.fn(),
  saveRefreshToken: vi.fn(),
  revokeUserRefreshTokens: vi.fn(),
  findValidRefreshToken: vi.fn(),
  revokeRefreshTokenById: vi.fn(),
  revokeRefreshTokenByHash: vi.fn(),
};

vi.mock('../repositories/authRepository.js', () => ({
  authRepository: mockAuthRepository,
}));

const mockRefreshTokenState = vi.hoisted(() => ({
  validToken: null as Record<string, unknown> | null,
}));

vi.mock('../repositories/refreshTokenRepository.js', () => ({
  refreshTokenRepository: {
    saveRefreshToken: vi.fn().mockResolvedValue(undefined),
    findValidRefreshToken: vi.fn(async () => mockRefreshTokenState.validToken),
    revokeUserRefreshTokens: vi.fn().mockResolvedValue(undefined),
    revokeRefreshTokenById: vi.fn().mockResolvedValue(undefined),
    revokeRefreshTokenByHash: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockBillingContextState = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}));

vi.mock('../repositories/subscriptionRepository.js', () => ({
  subscriptionRepository: {
    getBusinessBillingContext: vi.fn(async () =>
      mockBillingContextState.current ? { ...mockBillingContextState.current } : null
    ),
  },
}));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (cb: unknown) => {
      if (typeof cb === 'function') return (cb as (tx: unknown) => unknown)({});
      return cb;
    }),
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockSupabaseAuthService = {
  signInWithPassword: vi.fn(),
  signUpForEmailVerification: vi.fn(),
  resendVerificationEmail: vi.fn(),
  verifyEmailToken: vi.fn(),
  getVerifiedIdentityFromAccessToken: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
};

vi.mock('../services/supabaseAuthService.js', () => ({
  supabaseAuthService: mockSupabaseAuthService,
}));

const { createTestApp } = await import('./helpers/testApp.js');
const supertest = (await import('supertest')).default;
const jwt = (await import('jsonwebtoken')).default;
const { UnauthorizedError } = await import('../utils/errors.js');

const app = createTestApp();
const request = supertest(app);

const verifiedSupabaseIdentity = {
  userId: 'supabase-user-uuid',
  email: 'joao@teste.com',
  emailVerified: true,
  emailVerifiedAt: new Date().toISOString(),
  sessionExpiresAt: null,
  user: {
    id: 'supabase-user-uuid',
    email: 'joao@teste.com',
    email_confirmed_at: new Date().toISOString(),
    confirmed_at: new Date().toISOString(),
  },
};

const localUser = {
  id: 'user-uuid',
  email: 'joao@teste.com',
  email_verified: true,
  business_id: 'business-uuid',
  business_name: 'Negócio Teste',
  plan: 'premium',
  role: 'tenant_admin',
  auth_provider: 'supabase',
  supabase_user_id: 'supabase-user-uuid',
  blocked: false,
  subscription_status: 'active',
  subscription_current_period_end: null,
};

const resetMocks = () => {
  vi.clearAllMocks();
  process.env.AUTH_PROVIDER_MODE = 'legacy';
  process.env.JWT_SECRET = 'test-secret';
  mockClientQuery.mockResolvedValue({ rows: [] });
  mockSupabaseAuthService.signInWithPassword.mockResolvedValue(verifiedSupabaseIdentity);
  mockSupabaseAuthService.signUpForEmailVerification.mockResolvedValue({
    userId: 'supabase-user-uuid',
    email: 'joao@teste.com',
    verificationEmailSent: true,
  });
  mockSupabaseAuthService.resendVerificationEmail.mockResolvedValue({ accepted: true });
  mockSupabaseAuthService.getUserByEmail.mockResolvedValue(null);
  mockAuthRepository.updateUserIdentitySync.mockResolvedValue({
    id: 'user-uuid',
    supabase_user_id: 'supabase-user-uuid',
    auth_provider: 'supabase',
  });
  mockAuthRepository.revokeUserRefreshTokens.mockResolvedValue(undefined);
  mockAuthRepository.saveRefreshToken.mockResolvedValue(undefined);
};
const googleIdentity = {
  ...verifiedSupabaseIdentity,
  userId: 'sb1',
  email: 'dona@x.com',
  user: {
    id: 'sb1',
    email: 'dona@x.com',
    email_confirmed_at: new Date().toISOString(),
    confirmed_at: new Date().toISOString(),
    user_metadata: { full_name: 'Ana Souza' },
  },
};

const contaDona = {
  ...localUser,
  id: 'u1',
  email: 'dona@x.com',
  supabase_user_id: null,
  business_id: 'b1',
  business_name: 'Studio Aurora',
};

const ACCESS = 'token-do-supabase-com-mais-de-20';

describe('Login e cadastro pelo Google', () => {
  beforeEach(() => {
    resetMocks();
    mockSupabaseAuthService.getVerifiedIdentityFromAccessToken.mockResolvedValue(googleIdentity);
    mockAuthRepository.findPendingRegistrationForReconciliation.mockResolvedValue(null);
    mockAuthRepository.findUserBySupabaseUserIdForUpdate.mockResolvedValue(null);
    mockAuthRepository.findUserByEmailForSync.mockResolvedValue(null);
    mockAuthRepository.findBusinessById.mockResolvedValue({ id: 'b1', subscription_status: 'trialing', desired_plan: 'premium' });
  });

  it('oauthSessao liga conta existente pelo e-mail', async () => {
    mockAuthRepository.findUserBySupabaseUserId.mockResolvedValue(null);
    mockAuthRepository.findUserByEmailIncludingBlocked.mockResolvedValue(contaDona);
    mockAuthRepository.findUserByEmailForSync.mockResolvedValue(contaDona);

    const res = await request.post('/api/v1/auth/oauth/sessao').send({ accessToken: ACCESS });

    expect(res.status).toBe(200);
    expect(res.body.data.completarCadastro).toBe(false);
    expect(res.headers['set-cookie']?.join(';')).toContain('access_token=');
    expect(mockAuthRepository.createBusiness).not.toHaveBeenCalled();
  });

  it('oauthSessao sem conta pede completar', async () => {
    mockAuthRepository.findUserBySupabaseUserId.mockResolvedValue(null);
    mockAuthRepository.findUserByEmailIncludingBlocked.mockResolvedValue(null);

    const res = await request.post('/api/v1/auth/oauth/sessao').send({ accessToken: ACCESS });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ completarCadastro: true, email: 'dona@x.com', nome: 'Ana Souza' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('oauthSessao recusa conta bloqueada', async () => {
    mockAuthRepository.findUserBySupabaseUserId.mockResolvedValue({ ...contaDona, blocked: true });

    const res = await request.post('/api/v1/auth/oauth/sessao').send({ accessToken: ACCESS });

    expect(res.status).toBe(401);
  });

  it('oauthSessao recusa e-mail não verificado', async () => {
    mockSupabaseAuthService.getVerifiedIdentityFromAccessToken.mockResolvedValue({ ...googleIdentity, emailVerified: false });

    const res = await request.post('/api/v1/auth/oauth/sessao').send({ accessToken: ACCESS });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('oauthCompletar grava o pendente e cria a conta', async () => {
    let criado = false;
    mockAuthRepository.findUserBySupabaseUserId.mockImplementation(async () => (criado ? { ...contaDona, supabase_user_id: 'sb1' } : null));
    mockAuthRepository.findUserByEmailIncludingBlocked.mockResolvedValue(null);
    mockAuthRepository.upsertPendingRegistration.mockResolvedValue({ id: 'p1', email: 'dona@x.com' });
    mockAuthRepository.findPendingRegistrationForReconciliation.mockResolvedValue({
      id: 'p1', email: 'dona@x.com', business_name: 'Studio Aurora', owner_name: 'Ana Souza',
      whatsapp: '11999999999', cpf_cnpj: '52998224725', desired_plan: 'premium', supabase_user_id: 'sb1',
    });
    mockAuthRepository.findBusinessByEmailForUpdate.mockResolvedValue(null);
    mockAuthRepository.createBusiness.mockResolvedValue({ id: 'b1', name: 'Studio Aurora' });
    mockAuthRepository.createUser.mockImplementation(async () => { criado = true; return { ...contaDona, supabase_user_id: 'sb1' }; });
    mockAuthRepository.upsertTenantAdminUser.mockImplementation(async () => { criado = true; return { ...contaDona, supabase_user_id: 'sb1' }; });

    const res = await request.post('/api/v1/auth/oauth/completar').send({
      accessToken: ACCESS, businessName: 'Studio Aurora', ownerName: 'Ana Souza',
      whatsapp: '11999999999', cpfCnpj: '52998224725', desiredPlan: 'premium',
    });

    expect(res.status).toBe(200);
    expect(mockAuthRepository.upsertPendingRegistration).toHaveBeenCalledWith(null, expect.objectContaining({
      email: 'dona@x.com', supabaseUserId: 'sb1', businessName: 'Studio Aurora', ownerName: 'Ana Souza',
      whatsapp: '11999999999', cpfCnpj: '52998224725', desiredPlan: 'premium',
      passwordHash: expect.stringMatching(/^supabase:/),
    }));
    expect(mockAuthRepository.updateUserIdentitySync).toHaveBeenCalledWith(null, expect.objectContaining({
      userId: 'u1', authProvider: 'google',
    }));
    expect(res.headers['set-cookie']?.join(';')).toContain('access_token=');
  });

  it('oauthCompletar valida como o cadastro', async () => {
    const res = await request.post('/api/v1/auth/oauth/completar').send({
      accessToken: ACCESS, businessName: 'Studio Aurora', ownerName: 'Ana Souza',
      whatsapp: '11999999999', cpfCnpj: '11111111111', desiredPlan: 'premium',
    });

    expect(res.status).toBe(400);
    expect(mockAuthRepository.upsertPendingRegistration).not.toHaveBeenCalled();
  });

  it('login de conta só do Google explica', async () => {
    mockSupabaseAuthService.signInWithPassword.mockRejectedValue(new UnauthorizedError('Email ou senha incorretos'));
    mockAuthRepository.findAnyUserByEmail.mockResolvedValue({ ...contaDona, auth_provider: 'google' });

    const res = await request.post('/api/v1/auth/login').send({ email: 'dona@x.com', password: 'Senha123!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('CONTA_GOOGLE');
    expect(res.body.error.message).toBe('Essa conta entra com o Google. Use "Continuar com Google" ou crie uma senha em "Esqueci minha senha".');
  });
});
