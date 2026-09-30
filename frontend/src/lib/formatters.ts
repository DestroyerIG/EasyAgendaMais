// `cents: false` (padrão true, igual ao comportamento anterior desta função em todo
// o resto do app) omite os centavos — usado na tela Hoje, cujas referências do
// Stitch nunca mostram centavos em nenhum valor monetário.
export const formatCurrency = (value: number, options?: { cents?: boolean }): string => {
  const cents = options?.cents ?? true;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);
};

export const formatPhone = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};

export const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('pt-BR').format(value);
};

/**
 * Duração de um serviço por extenso: "30 min", "1 hora", "1 hora e 20 min", "2 horas".
 * Usada onde a duração do serviço aparece fora de telas com referência no Stitch
 * (Ajustes › Serviços e equipe, seletor de serviço do Novo Agendamento) — pedido do
 * usuário para não mostrar direto em minutos a partir de 1 hora.
 */
export const formatDurationExtenso = (minutos: number): string => {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${minutos} min`;
  const rotuloHoras = `${horas} hora${horas > 1 ? 's' : ''}`;
  return resto === 0 ? rotuloHoras : `${rotuloHoras} e ${resto} min`;
};
