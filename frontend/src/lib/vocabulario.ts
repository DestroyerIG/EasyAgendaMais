import type { Segmento } from '@/lib/technicalSheetTemplates';

// Vocabulário por segmento (fase 6). A fonte é o backend (config/vocabulario.ts): chega pronto no
// /auth/me e na vitrine pública. Aqui só ficam o tipo, o padrão (para quando ainda não carregou) e
// os termos já flexionados que as telas usam.

export type Genero = 'f' | 'm';
export interface Termo { singular: string; plural: string; genero: Genero }
export interface Vocabulario {
  segmento: Segmento;
  profissional: Termo;
  cliente: Termo;
  negocio: Termo;
}

export const VOCABULARIO_PADRAO: Vocabulario = {
  segmento: 'outro',
  profissional: { singular: 'profissional', plural: 'profissionais', genero: 'f' },
  cliente: { singular: 'cliente', plural: 'clientes', genero: 'f' },
  negocio: { singular: 'negócio', plural: 'negócios', genero: 'm' },
};

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Formas prontas de um termo: "a profissional", "da profissional", "dela", "nenhuma"… */
export interface Formas {
  /** profissional */ s: string;
  /** Profissional */ S: string;
  /** profissionais */ p: string;
  /** Profissionais */ P: string;
  /** a / o */ o: string;
  /** a profissional / o barbeiro */ oS: string;
  /** A profissional / O barbeiro */ OS: string;
  /** as profissionais / os barbeiros */ osP: string;
  /** da profissional / do barbeiro */ doS: string;
  /** das profissionais / dos barbeiros */ dosP: string;
  /** à profissional / ao barbeiro */ aoS: string;
  /** na profissional / no barbeiro */ noS: string;
  /** uma profissional / um barbeiro */ umS: string;
  /** ela / ele */ ele: string;
  /** dela / dele */ dele: string;
  /** escolhe a forma pelo gênero: g('nova', 'novo') */
  g: (feminino: string, masculino: string) => string;
}

export function formas(t: Termo): Formas {
  const f = t.genero === 'f';
  const g = (feminino: string, masculino: string) => (f ? feminino : masculino);
  return {
    s: t.singular, S: maiuscula(t.singular), p: t.plural, P: maiuscula(t.plural),
    o: g('a', 'o'),
    oS: `${g('a', 'o')} ${t.singular}`, OS: `${g('A', 'O')} ${t.singular}`, osP: `${g('as', 'os')} ${t.plural}`,
    doS: `${g('da', 'do')} ${t.singular}`, dosP: `${g('das', 'dos')} ${t.plural}`,
    aoS: `${g('à', 'ao')} ${t.singular}`, noS: `${g('na', 'no')} ${t.singular}`, umS: `${g('uma', 'um')} ${t.singular}`,
    ele: g('ela', 'ele'), dele: g('dela', 'dele'),
    g,
  };
}

// Determinantes que concordam com o termo: forma feminina → masculina.
const PARA_MASCULINO: Record<string, string> = {
  a: 'o', A: 'O', da: 'do', Da: 'Do', na: 'no', Na: 'No', 'à': 'ao', 'À': 'Ao', uma: 'um', Uma: 'Um',
  esta: 'este', Esta: 'Este', essa: 'esse', Essa: 'Esse', outra: 'outro', Outra: 'Outro', nenhuma: 'nenhum', Nenhuma: 'Nenhum',
  nova: 'novo', Nova: 'Novo', sua: 'seu', Sua: 'Seu', primeira: 'primeiro', Primeira: 'Primeiro', pela: 'pelo', Pela: 'Pelo',
  as: 'os', As: 'Os', das: 'dos', Das: 'Dos', nas: 'nos', Nas: 'Nos', 'às': 'aos', 'Às': 'Aos', suas: 'seus', Suas: 'Seus',
  outras: 'outros', Outras: 'Outros', novas: 'novos', Novas: 'Novos', primeiras: 'primeiros', Primeiras: 'Primeiros',
  pelas: 'pelos', Pelas: 'Pelos', todas: 'todos', Todas: 'Todos',
  desta: 'deste', Desta: 'Deste', dessa: 'desse', Dessa: 'Desse', nesta: 'neste', Nesta: 'Neste', nessa: 'nesse', Nessa: 'Nesse',
  cada: 'cada', Cada: 'Cada', duas: 'dois', Duas: 'Dois',
};
const DETERMINANTE = Object.keys(PARA_MASCULINO).sort((x, y) => y.length - x.length).join('|');

/** Troca "profissional(is)"/"cliente(s)" pelo termo do segmento e acerta o gênero do que vem antes. */
function adaptarTermo(texto: string, palavra: string, plural: string, t: Termo): string {
  const masculino = t.genero === 'm';
  // Fronteira de palavra que entende acento (o \b do JS não vê "à"/"às" como letra).
  const re = new RegExp(`(?:(?<![\\p{L}\\p{N}])(${DETERMINANTE}) )?(?<![\\p{L}\\p{N}])(${palavra}|${plural})(?![\\p{L}\\p{N}])`, 'giu');
  return texto.replace(re, (_todo, det: string | undefined, nome: string) => {
    const ehPlural = nome.toLowerCase() === plural;
    const maiusc = nome.charAt(0) === nome.charAt(0).toUpperCase();
    const termo = ehPlural ? t.plural : t.singular;
    const novoNome = maiusc ? maiuscula(termo) : termo;
    if (!det) return novoNome;
    const novoDet = masculino ? (PARA_MASCULINO[det] ?? det) : det;
    return `${novoDet} ${novoNome}`;
  });
}

export interface Termos {
  segmento: Segmento; prof: Formas; cli: Formas; neg: Formas;
  /**
   * Texto escrito com "a profissional"/"a cliente" já no vocabulário do segmento. Só acerta o que vem
   * antes do termo; adjetivo depois dele ("cliente atualizada") usa `cli.g(...)`.
   */
  adaptar: (texto: string) => string;
}

export const termosDe = (v: Vocabulario | null | undefined): Termos => {
  const voc = v ?? VOCABULARIO_PADRAO;
  const padrao = voc.segmento === 'outro';
  return {
    segmento: voc.segmento, prof: formas(voc.profissional), cli: formas(voc.cliente), neg: formas(voc.negocio),
    adaptar: (texto) => (padrao ? texto : adaptarTermo(adaptarTermo(texto, 'profissional', 'profissionais', voc.profissional), 'cliente', 'clientes', voc.cliente)),
  };
};
