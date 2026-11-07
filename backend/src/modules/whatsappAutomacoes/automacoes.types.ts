export type Regra = 'confirmacao' | 'sinal_pix' | 'retorno' | 'lista_espera' | 'lembrete' | 'aniversario' | 'avaliacao';

// Ordem de exibição (a do Stitch)
export const REGRAS: Regra[] = ['confirmacao', 'sinal_pix', 'retorno', 'lista_espera', 'lembrete', 'aniversario', 'avaliacao'];

export interface ConfigRegras {
  confirmacao: { hora: string; textoConfirmado: string | null; textoCancelado: string | null };
  sinal_pix: { toleranciaMin: 15 | 30 | 60 };
  retorno: { modo: 'ciclo' | 'dias'; dias: number };
  lista_espera: { quantas: 1 | 3 | 5 };
  lembrete: { modo: '2h' | 'vespera'; hora: string };
  aniversario: { presente: string };
  avaliacao: {
    horas: 1 | 2 | 4;
    linkGoogle: string | null;
    /** Agradecimento pela nota; null usa o texto padrão. */
    textoNota: string | null;
    /** Convite ao Google (aceita {link}); null usa o texto padrão. */
    textoGoogle: string | null;
  };
}

export interface RegraDto<R extends Regra = Regra> {
  regra: R;
  ativa: boolean;
  texto: string;
  textoPadrao: string;
  personalizado: boolean;
  config: ConfigRegras[R];
  variaveis: string[];
}
