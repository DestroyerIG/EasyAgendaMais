import { buildPixPayload } from '../../utils/pixPayload.js';
import logger from '../../utils/logger.js';

type PixKeyType = Parameters<typeof buildPixPayload>[0]['pixKeyType'];

/** Código Pix manual (chave do negócio). Nulo se o negócio não tem chave ou o valor não vale. */
export const pixManual = (
  business: { name: string; pixKey: string | null; pixKeyType: string | null },
  valor: number,
  servico: string,
): string | null => {
  if (!business.pixKey || !business.pixKeyType || valor <= 0) return null;
  try {
    return buildPixPayload({
      pixKey: business.pixKey, pixKeyType: business.pixKeyType as PixKeyType,
      merchantName: business.name, merchantCity: 'BRASIL', amount: valor, description: `Sinal - ${servico}`,
    });
  } catch (err) {
    logger.warn({ err }, 'Falha ao montar o código Pix manual');
    return null;
  }
};

export const calcDeposit = (price: number, depositPercentage: number): number =>
  Math.round(price * (depositPercentage / 100) * 100) / 100;
