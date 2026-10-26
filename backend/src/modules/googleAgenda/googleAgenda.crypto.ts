import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

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
  const iv = randomBytes(12);
  const cifra = createCipheriv('aes-256-gcm', chaveDoToken(), iv);
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  return [iv, cifra.getAuthTag(), dados].map((b) => b.toString('base64url')).join('.');
}

export function decifrar(cifrado: string): string {
  const [iv, tag, dados] = cifrado.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !dados) throw new Error('Token cifrado inválido');
  const decifra = createDecipheriv('aes-256-gcm', chaveDoToken(), iv);
  decifra.setAuthTag(tag);
  return Buffer.concat([decifra.update(dados), decifra.final()]).toString('utf8');
}
