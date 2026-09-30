import { describe, it, expect } from 'vitest';
import { isPublicAuthPath } from '@/lib/publicRoutes';

describe('isPublicAuthPath — /agendar', () => {
  it('trata qualquer slug sob /agendar como rota pública', () => {
    expect(isPublicAuthPath('/agendar/studio-aurora')).toBe(true);
    expect(isPublicAuthPath('/agendar')).toBe(true);
  });
});
