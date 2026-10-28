// Prazo da carência após o pagamento atrasar, em dias. Fonte única da regra de contingência.
export const CARENCIA_DIAS = 7;

// Status que entram em contingência (só para quem já pagou alguma vez).
export const STATUS_CONTINGENCIA = ['past_due', 'unpaid', 'pending'] as const;

// Origens da fila de WhatsApp liberadas durante a carência: cobram compromissos que já existiam.
export const ORIGENS_NA_CARENCIA = ['lembrete', 'confirmacao', 'pix_recibo', 'sinal_pix', 'clube'] as const;
