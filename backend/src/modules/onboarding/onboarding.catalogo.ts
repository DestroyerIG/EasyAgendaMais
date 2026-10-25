import type { Segmento } from '../crm/technicalSheetTemplates.js';

// Serviços sugeridos na etapa 3, por segmento. Preços e durações médios: a dona ajusta antes de salvar.

export interface ServicoSugerido {
  nome: string;
  descricao: string;
  duracaoMinutos: number;
  preco: number;
  sinalPct: number | null;
  marcado: boolean;
}

const s = (nome: string, descricao: string, duracaoMinutos: number, preco: number, sinalPct: number | null, marcado = true): ServicoSugerido =>
  ({ nome, descricao, duracaoMinutos, preco, sinalPct, marcado });

export const CATALOGO: Record<Segmento, ServicoSugerido[]> = {
  unhas: [
    s('Alongamento em gel', 'Aplicação completa com tips ou molde', 150, 180, 30),
    s('Manutenção de alongamento', 'Nivelamento e reposição em gel ou fibra', 120, 120, 30),
    s('Esmaltação em gel', 'Cuticulagem e esmaltação com secagem em cabine', 60, 70, null),
    s('Manicure', 'Cutilagem e esmaltação tradicional', 45, 35, null),
    s('Pedicure', 'Cutilagem e esmaltação dos pés', 50, 40, null),
    s('Spa dos pés', 'Esfoliação, hidratação e massagem', 60, 70, null, false),
    s('Nail art (por unha)', 'Decoração artística', 10, 10, null, false),
  ],
  cilios_sobrancelhas: [
    s('Extensão de cílios fio a fio', 'Aplicação completa', 120, 180, 30),
    s('Extensão de cílios volume russo', 'Aplicação completa em leque', 150, 220, 30),
    s('Manutenção de cílios', 'Reposição até 21 dias', 90, 120, null),
    s('Lash lifting', 'Curvatura e tintura dos fios naturais', 60, 130, null),
    s('Design de sobrancelha', 'Mapeamento e modelagem com pinça', 40, 45, null),
    s('Design com henna', 'Modelagem e preenchimento com henna', 50, 60, null),
    s('Brow lamination', 'Alinhamento e fixação dos fios', 60, 140, null, false),
    s('Remoção de extensão', 'Retirada segura dos fios', 30, 40, null, false),
  ],
  cabelo: [
    s('Corte feminino', 'Corte com lavagem e finalização', 60, 90, null),
    s('Escova', 'Lavagem e escova modelada', 45, 60, null),
    s('Coloração', 'Coloração de raiz ou global', 120, 160, 30),
    s('Mechas / luzes', 'Mechas, luzes ou balayage', 240, 350, 30),
    s('Hidratação', 'Tratamento de hidratação profunda', 45, 80, null),
    s('Progressiva', 'Alisamento progressivo', 180, 280, 30),
    s('Corte masculino', 'Corte com finalização', 40, 50, null, false),
    s('Penteado', 'Penteado para eventos', 60, 150, 30, false),
  ],
  barbearia: [
    s('Corte de cabelo', 'Corte na máquina e tesoura', 40, 45, null),
    s('Barba', 'Barba com toalha quente e navalha', 30, 35, null),
    s('Corte + barba', 'Combo completo', 60, 70, null),
    s('Pezinho', 'Acabamento do contorno', 15, 15, null),
    s('Sobrancelha', 'Acabamento na navalha', 10, 15, null, false),
    s('Pigmentação de barba', 'Preenchimento das falhas', 30, 40, null, false),
    s('Luzes / platinado', 'Descoloração e tonalização', 120, 150, 30, false),
  ],
  estetica: [
    s('Limpeza de pele', 'Higienização, extração e máscara', 90, 150, 30),
    s('Massagem relaxante', 'Sessão de 60 minutos', 60, 120, null),
    s('Drenagem linfática', 'Sessão corporal', 60, 120, null),
    s('Peeling', 'Renovação da pele', 60, 180, 30),
    s('Depilação de pernas', 'Pernas inteiras com cera', 45, 70, null),
    s('Depilação de axilas', 'Com cera', 15, 25, null, false),
    s('Massagem modeladora', 'Sessão corporal', 60, 130, null, false),
  ],
  outro: [
    s('Atendimento', 'Atendimento padrão', 60, 100, null),
    s('Avaliação', 'Primeira conversa e avaliação', 30, 50, null, false),
  ],
};

export const catalogoDe = (segmento: Segmento): ServicoSugerido[] => CATALOGO[segmento].map((x) => ({ ...x }));
