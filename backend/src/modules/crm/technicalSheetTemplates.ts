export type Segmento = 'unhas' | 'cilios_sobrancelhas' | 'cabelo' | 'barbearia' | 'estetica' | 'outro';
export interface CampoFicha { key: string; label: string; type: 'texto' | 'opcoes'; options?: string[] }

const t = (key: string, label: string): CampoFicha => ({ key, label, type: 'texto' });
const o = (key: string, label: string, options: string[]): CampoFicha => ({ key, label, type: 'opcoes', options });

export const SEGMENTOS: Record<Segmento, { rotulo: string; campos: CampoFicha[] }> = {
  unhas: {
    rotulo: 'Unhas',
    campos: [
      o('formato', 'Formato preferido', ['Amendoado', 'Quadrado', 'Stiletto', 'Bailarina', 'Redondo']),
      t('comprimento', 'Comprimento'),
      t('cor', 'Cor/acabamento favorito'),
      t('curvatura', 'Curvatura'),
      t('aplicacao', 'Observações de aplicação'),
    ],
  },
  cilios_sobrancelhas: {
    rotulo: 'Cílios e sobrancelhas',
    campos: [
      o('tecnica', 'Técnica', ['Fio a fio', 'Volume russo', 'Híbrido', 'Lash lifting']),
      t('curvatura', 'Curvatura'),
      t('espessura', 'Espessura'),
      t('tamanho', 'Tamanho'),
      t('sobrancelha', 'Formato da sobrancelha'),
      t('observacoes', 'Observações'),
    ],
  },
  cabelo: {
    rotulo: 'Cabelo',
    campos: [
      t('tipo_fio', 'Tipo de fio'),
      t('quimica', 'Química atual'),
      t('coloracao', 'Coloração (número/marca)'),
      t('corte', 'Corte preferido'),
      t('observacoes', 'Observações'),
    ],
  },
  barbearia: {
    rotulo: 'Barbearia',
    campos: [
      t('maquina', 'Máquina (altura)'),
      t('estilo', 'Estilo do corte'),
      t('barba', 'Barba'),
      t('produtos', 'Produtos preferidos'),
      t('observacoes', 'Observações'),
    ],
  },
  estetica: {
    rotulo: 'Estética',
    campos: [
      t('pele', 'Tipo de pele'),
      t('sensibilidade', 'Sensibilidade'),
      t('protocolo', 'Protocolo atual'),
      t('contraindicacoes', 'Contraindicações'),
      t('observacoes', 'Observações'),
    ],
  },
  outro: { rotulo: 'Outro', campos: [t('observacoes', 'Observações')] },
};
