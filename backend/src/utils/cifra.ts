import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM com chave de 32 bytes passada por quem chama. Formato "iv.tag.dados", em base64url.

export function cifrarCom(chave: Buffer, texto: string): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv('aes-256-gcm', chave, iv);
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  return [iv, cifra.getAuthTag(), dados].map((b) => b.toString('base64url')).join('.');
}

export function decifrarCom(chave: Buffer, cifrado: string): string {
  const [iv, tag, dados] = cifrado.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !dados) throw new Error('Token cifrado inválido');
  const decifra = createDecipheriv('aes-256-gcm', chave, iv);
  decifra.setAuthTag(tag);
  return Buffer.concat([decifra.update(dados), decifra.final()]).toString('utf8');
}
