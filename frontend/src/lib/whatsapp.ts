/**
 * Link do WhatsApp — compartilhado entre ClientModule.tsx, a antiga ClientDetailPanel.tsx (removida) e
 * PainelDetalhesAgendamento.tsx, que antes desta correção (M3 da revisão final)
 * duplicavam a mesma função. Os três arquivos continuam reexportando `linkWhatsapp`
 * (import daqui) para não quebrar quem já importava dele.
 */
export function linkWhatsapp(telefone: string | undefined): string | null {
  const digitos = (telefone || '').replace(/\D/g, '');
  if (digitos.length !== 10 && digitos.length !== 11) return null;
  return `https://wa.me/55${digitos}`;
}
