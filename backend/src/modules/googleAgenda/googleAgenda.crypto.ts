import { cifrarCom, decifrarCom } from '../../utils/cifra.js';

// Google Agenda (fase 7): o refresh token fica cifrado no banco com AES-256-GCM.
// GOOGLE_TOKEN_KEY é uma chave de 32 bytes em base64.

/** Sem as quatro variáveis, o Google Agenda some das telas e nada é chamado. */
export function googleConfigurado(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      && process.env.GOOGLE_AGENDA_REDIRECT_URI && process.env.GOOGLE_TOKEN_KEY,
  );
}

export function chaveDoToken(): Buffer {
  const chave = Buffer.from(process.env.GOOGLE_TOKEN_KEY ?? '', 'base64');
  if (chave.length !== 32) throw new Error('GOOGLE_TOKEN_KEY precisa ter 32 bytes em base64');
  return chave;
}

/** Formato "iv.tag.dados", cada parte em base64url. */
export function cifrar(texto: string): string {
  return cifrarCom(chaveDoToken(), texto);
}

export function decifrar(cifrado: string): string {
  return decifrarCom(chaveDoToken(), cifrado);
}
