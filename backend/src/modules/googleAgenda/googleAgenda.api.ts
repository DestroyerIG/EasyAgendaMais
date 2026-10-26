// Google Agenda (fase 7): chamadas REST ao Google, sem a biblioteca googleapis.
// Escopos mínimos: criar e mexer só na agenda criada pelo app, e ler só ocupado/livre.

export const ESCOPOS_AGENDA = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const CALENDAR = 'https://www.googleapis.com/calendar/v3';

/** O Google recusou o acesso (revogado, senha trocada): a conexão precisa ser refeita. */
export class GoogleTokenInvalido extends Error {
  constructor(msg = 'Acesso ao Google Agenda recusado') { super(msg); this.name = 'GoogleTokenInvalido'; }
}

/** Limite de uso ou instabilidade do Google: tenta de novo no próximo ciclo. */
export class GoogleIndisponivel extends Error {
  constructor(msg = 'Google Agenda indisponível') { super(msg); this.name = 'GoogleIndisponivel'; }
}

export interface EventoGoogle {
  titulo: string;
  descricao: string;
  /** Data e hora locais, sem fuso: "2026-11-10T14:00:00". */
  inicio: string;
  fim: string;
  fuso: string;
}

const cliente = () => ({
  id: process.env.GOOGLE_CLIENT_ID ?? '',
  segredo: process.env.GOOGLE_CLIENT_SECRET ?? '',
  redirect: process.env.GOOGLE_AGENDA_REDIRECT_URI ?? '',
});

function erroDoStatus(status: number, corpo: unknown): Error {
  const codigo = (corpo as { error?: unknown } | null)?.error;
  if (status === 401 || codigo === 'invalid_grant') return new GoogleTokenInvalido();
  if (status === 429 || status >= 500) return new GoogleIndisponivel();
  return new Error(`Google respondeu ${status}`);
}

async function lerJson(r: Response): Promise<unknown> {
  try { return await r.json(); } catch { return null; }
}

async function chamar(url: string, init: RequestInit): Promise<unknown> {
  const r = await fetch(url, init);
  const corpo = await lerJson(r);
  if (!r.ok) throw erroDoStatus(r.status, corpo);
  return corpo;
}

const comToken = (token: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, ...extra });
const json = (token: string) => comToken(token, { 'Content-Type': 'application/json' });

/** O e-mail vem no id_token (JWT) devolvido na troca do código. */
function emailDoIdToken(idToken: unknown): string {
  if (typeof idToken !== 'string') return '';
  try {
    const carga = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: unknown };
    return typeof carga.email === 'string' ? carga.email : '';
  } catch {
    return '';
  }
}

const corpoDoEvento = (e: EventoGoogle) => ({
  summary: e.titulo,
  description: e.descricao,
  start: { dateTime: e.inicio, timeZone: e.fuso },
  end: { dateTime: e.fim, timeZone: e.fuso },
  reminders: { useDefault: true },
});

export const googleApi = {
  urlConsentimento(state: string): string {
    const c = cliente();
    const url = new URL(AUTH_URL);
    url.search = new URLSearchParams({
      client_id: c.id,
      redirect_uri: c.redirect,
      response_type: 'code',
      scope: ESCOPOS_AGENDA.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'false',
      state,
    }).toString();
    return url.toString();
  },

  async trocarCodigo(code: string): Promise<{ refreshToken: string; email: string }> {
    const c = cliente();
    const corpo = await chamar(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: c.id, client_secret: c.segredo, redirect_uri: c.redirect, grant_type: 'authorization_code',
      }).toString(),
    }) as { refresh_token?: string; id_token?: string };
    if (!corpo.refresh_token) throw new GoogleTokenInvalido('O Google não devolveu o acesso offline');
    return { refreshToken: corpo.refresh_token, email: emailDoIdToken(corpo.id_token) };
  },

  async accessToken(refreshToken: string): Promise<string> {
    const c = cliente();
    const corpo = await chamar(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken, client_id: c.id, client_secret: c.segredo, grant_type: 'refresh_token',
      }).toString(),
    }) as { access_token?: string };
    if (!corpo.access_token) throw new GoogleTokenInvalido();
    return corpo.access_token;
  },

  async criarAgenda(token: string, nome: string, fuso: string): Promise<string> {
    const corpo = await chamar(`${CALENDAR}/calendars`, {
      method: 'POST', headers: json(token), body: JSON.stringify({ summary: nome, timeZone: fuso }),
    }) as { id: string };
    return corpo.id;
  },

  async salvarEvento(token: string, calendarioId: string, evento: EventoGoogle, googleEventId?: string): Promise<string> {
    const base = `${CALENDAR}/calendars/${encodeURIComponent(calendarioId)}/events`;
    const corpo = await chamar(googleEventId ? `${base}/${encodeURIComponent(googleEventId)}` : base, {
      method: googleEventId ? 'PUT' : 'POST', headers: json(token), body: JSON.stringify(corpoDoEvento(evento)),
    }) as { id: string };
    return corpo.id;
  },

  async apagarEvento(token: string, calendarioId: string, googleEventId: string): Promise<void> {
    const r = await fetch(
      `${CALENDAR}/calendars/${encodeURIComponent(calendarioId)}/events/${encodeURIComponent(googleEventId)}`,
      { method: 'DELETE', headers: comToken(token) },
    );
    // Já apagado no Google (pela própria pessoa): nada a fazer.
    if (r.ok || r.status === 404 || r.status === 410) return;
    throw erroDoStatus(r.status, await lerJson(r));
  },

  async ocupado(token: string, de: Date, ate: Date): Promise<Array<{ inicio: Date; fim: Date }>> {
    const corpo = await chamar(`${CALENDAR}/freeBusy`, {
      method: 'POST',
      headers: json(token),
      body: JSON.stringify({ timeMin: de.toISOString(), timeMax: ate.toISOString(), items: [{ id: 'primary' }] }),
    }) as { calendars?: { primary?: { busy?: Array<{ start: string; end: string }> } } };
    return (corpo.calendars?.primary?.busy ?? []).map((b) => ({ inicio: new Date(b.start), fim: new Date(b.end) }));
  },

  async revogar(refreshToken: string): Promise<void> {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }).toString(),
    });
  },
};
