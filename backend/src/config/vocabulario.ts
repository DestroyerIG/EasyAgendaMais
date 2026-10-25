import type { Segmento } from '../modules/crm/technicalSheetTemplates.js';

// Vocabulário por segmento (fase 6): fonte única. O frontend recebe pronto no /auth/me e na página
// pública; o bot usa nas mensagens padrão. O padrão ("outro") mantém os textos de sempre.

export type Genero = 'f' | 'm';
export interface Termo { singular: string; plural: string; genero: Genero }
export interface Vocabulario {
  segmento: Segmento;
  profissional: Termo;
  cliente: Termo;
  negocio: Termo;
}

const f = (singular: string, plural: string): Termo => ({ singular, plural, genero: 'f' });
const m = (singular: string, plural: string): Termo => ({ singular, plural, genero: 'm' });

const CLIENTE_F = f('cliente', 'clientes');

export const VOCABULARIO: Record<Segmento, Vocabulario> = {
  barbearia: { segmento: 'barbearia', profissional: m('barbeiro', 'barbeiros'), cliente: m('cliente', 'clientes'), negocio: f('barbearia', 'barbearias') },
  unhas: { segmento: 'unhas', profissional: f('nail designer', 'nail designers'), cliente: CLIENTE_F, negocio: m('estúdio', 'estúdios') },
  cilios_sobrancelhas: { segmento: 'cilios_sobrancelhas', profissional: f('lash designer', 'lash designers'), cliente: CLIENTE_F, negocio: m('estúdio', 'estúdios') },
  cabelo: { segmento: 'cabelo', profissional: f('cabeleireira', 'cabeleireiras'), cliente: CLIENTE_F, negocio: m('salão', 'salões') },
  estetica: { segmento: 'estetica', profissional: f('esteticista', 'esteticistas'), cliente: CLIENTE_F, negocio: f('clínica', 'clínicas') },
  outro: { segmento: 'outro', profissional: f('profissional', 'profissionais'), cliente: CLIENTE_F, negocio: m('negócio', 'negócios') },
};

export const SEGMENTOS_VALIDOS = Object.keys(VOCABULARIO) as Segmento[];

export function vocabularioDe(segmento: string | null | undefined): Vocabulario {
  return VOCABULARIO[segmento as Segmento] ?? VOCABULARIO.outro;
}

/** "o"/"a" (ou "os"/"as") do termo. */
export const artigo = (t: Termo, plural = false) => (t.genero === 'f' ? 'a' : 'o') + (plural ? 's' : '');
/** "este"/"esta", "outro"/"outra" etc.: escolhe a forma pelo gênero do termo. */
export const pelo = (t: Termo, feminino: string, masculino: string) => (t.genero === 'f' ? feminino : masculino);
export const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
