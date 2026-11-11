import { describe, it, expect } from 'vitest';
import { isPublicAuthPath } from '@/lib/publicRoutes';

describe('isPublicAuthPath — páginas de marketing', () => {
  it('trata a landing e a página de nail designers como públicas', () => {
    expect(isPublicAuthPath('/')).toBe(true);
    expect(isPublicAuthPath('/nail-designers')).toBe(true);
  });
});

describe('isPublicAuthPath — /agendar', () => {
  it('trata qualquer slug sob /agendar como rota pública', () => {
    expect(isPublicAuthPath('/agendar/studio-aurora')).toBe(true);
    expect(isPublicAuthPath('/agendar')).toBe(true);
  });
});

describe('isPublicAuthPath: retorno do link de pagamento', () => {
  it('a página de pagamento recebido é pública, e a de assinatura (/pagamento) continua protegida', () => {
    expect(isPublicAuthPath('/pagamento-recebido')).toBe(true);
    expect(isPublicAuthPath('/pagamento')).toBe(false);
  });
});
