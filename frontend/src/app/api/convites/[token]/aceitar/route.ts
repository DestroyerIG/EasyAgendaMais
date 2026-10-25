import { NextRequest } from 'next/server';
import {
  clearAuthCookies,
  errorResponse,
  extractAuthTokens,
  requestBackendAuth,
  setAuthCookies,
  successResponse,
} from '@/lib/server/authBff';

// Aceitar o convite cria o login da profissional e já abre a sessão: os tokens viram cookies, como no login.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, null, 'Corpo JSON inválido.');
  }

  const upstream = await requestBackendAuth(`${encodeURIComponent(token)}/aceitar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 'convites');

  if (!upstream.response || upstream.networkError) {
    return errorResponse(502, null, 'Falha ao comunicar com o serviço de autenticação.');
  }
  if (!upstream.response.ok) {
    return errorResponse(upstream.response.status, upstream.payload, 'Não foi possível aceitar o convite.');
  }

  const { accessToken, refreshToken } = extractAuthTokens(upstream.payload);
  if (!accessToken || !refreshToken) {
    const response = errorResponse(502, upstream.payload, 'Contrato de autenticação inválido.');
    clearAuthCookies(response);
    return response;
  }
  const response = successResponse(upstream.payload, upstream.response.status);
  setAuthCookies(response, accessToken, refreshToken);
  return response;
}
