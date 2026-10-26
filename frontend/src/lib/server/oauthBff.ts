import type { NextRequest } from 'next/server';
import {
  errorResponse,
  extractAuthTokens,
  requestBackendAuth,
  setAuthCookies,
  successResponse,
} from '@/lib/server/authBff';

// Login com Google (fase 7): como o /auth/login, mas o backend pode responder "complete o cadastro"
// sem sessão. Os cookies só são gravados quando a resposta traz os tokens.
export async function encaminharOAuth(rota: 'oauth/sessao' | 'oauth/completar', request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, null, 'Corpo JSON inválido.');
  }

  const upstream = await requestBackendAuth(rota, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!upstream.response || upstream.networkError) {
    return errorResponse(502, null, 'Falha ao comunicar com o serviço de autenticação.');
  }
  if (!upstream.response.ok) {
    return errorResponse(upstream.response.status, upstream.payload, 'Não foi possível entrar com o Google.');
  }

  const response = successResponse(upstream.payload, upstream.response.status);
  const { accessToken, refreshToken } = extractAuthTokens(upstream.payload);
  if (accessToken && refreshToken) setAuthCookies(response, accessToken, refreshToken);
  return response;
}
