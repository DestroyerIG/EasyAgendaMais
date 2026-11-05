// Lista fechada de comodidades da página pública: o backend aceita só estes ids.

export interface Comodidade { id: string; rotulo: string; icone: string }

export const COMODIDADES: readonly Comodidade[] = [
  { id: 'wifi', rotulo: 'Wi-Fi', icone: 'wifi' },
  { id: 'cafe', rotulo: 'Café', icone: 'local_cafe' },
  { id: 'estacionamento', rotulo: 'Estacionamento', icone: 'local_parking' },
  { id: 'ar_condicionado', rotulo: 'Ar-condicionado', icone: 'ac_unit' },
  { id: 'acessibilidade', rotulo: 'Acessível', icone: 'accessible' },
  { id: 'materiais_esterilizados', rotulo: 'Materiais esterilizados', icone: 'check_circle' },
];

/** Ignora id desconhecido, para a página não quebrar se a lista mudar. */
export const comodidadesDe = (ids: readonly string[] | undefined): Comodidade[] =>
  COMODIDADES.filter((c) => ids?.includes(c.id));
