export type SegmentKey = 'barbearia' | 'unhas' | 'cilios' | 'salao' | 'estetica';

export type SegmentData = {
  label: string;
  name: string;
  sub: string;
  service: string;
  price: number;
  deposit: number;
  duration: string;
  /** Logo/foto do negócio no card do celular; sem ela, usa a foto padrão do estúdio. */
  avatar?: { src: string; alt: string; contain?: boolean };
};

export const segments: Record<SegmentKey, SegmentData> = {
  barbearia: {
    label: 'Barbearia',
    name: 'Barbearia Exemplo',
    sub: 'Cortes clássicos, barba e visagismo',
    service: 'Corte Degradê & Barba',
    price: 85,
    deposit: 25,
    duration: '45m',
    avatar: { src: '/images/barbearia-logo.png', alt: 'Logo da Barbearia Exemplo', contain: true },
  },
  unhas: {
    label: 'Unhas',
    name: 'Studio Aurora',
    sub: 'Especialista em Alongamento & Fibra',
    service: 'Manutenção Fibra de Vidro',
    price: 130,
    deposit: 30,
    duration: '1h 45m',
  },
  cilios: {
    label: 'Cílios e sobrancelha',
    name: 'Studio Cílios',
    sub: 'Extensão de Cílios & Lash Lifting',
    service: 'Volume Brasileiro (Manutenção)',
    price: 140,
    deposit: 40,
    duration: '2h',
  },
  salao: {
    label: 'Salão',
    name: 'Salão Conceito',
    sub: 'Mechas, tratamentos e coloração',
    service: 'Cronograma & Escova Modelada',
    price: 180,
    deposit: 50,
    duration: '2h 30m',
  },
  estetica: {
    label: 'Estética',
    name: 'Clínica de Estética',
    sub: 'Protocolos faciais e corporais',
    service: 'Limpeza de Pele Profunda',
    price: 160,
    deposit: 40,
    duration: '1h 15m',
  },
};

export const segmentOrder: SegmentKey[] = ['barbearia', 'unhas', 'cilios', 'salao', 'estetica'];
