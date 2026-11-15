import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';

export const couponService = {
  async validate(code: string, originalAmount: number): Promise<{ discount: number; finalAmount: number; coupon: Record<string, unknown> | null }> {
    if (!code) return { discount: 0, finalAmount: originalAmount, coupon: null };

    const coupon = await prisma.coupon.findFirst({
      where: {
        code: code.trim().toUpperCase(),
        active: true,
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
    });

    if (!coupon) throw new AppError('Cupom inválido ou expirado.', 400, 'INVALID_COUPON');

    // column-vs-column comparison: maxUses vs currentUses — filter app-side
    if (coupon.maxUses !== null && coupon.currentUses >= coupon.maxUses)
      throw new AppError('Cupom inválido ou expirado.', 400, 'INVALID_COUPON');

    const discountValue = Number(coupon.discountValue);
    const discount =
      coupon.discountType === 'percent'
        ? Number(((originalAmount * discountValue) / 100).toFixed(2))
        : Math.min(discountValue, originalAmount);

    const finalAmount = Math.max(0, Number((originalAmount - discount).toFixed(2)));

    return { discount, finalAmount, coupon: coupon as unknown as Record<string, unknown> };
  },

  /**
   * Reserva um uso do cupom de forma atômica: o limite, a validade e o estado ativo
   * são checados no próprio UPDATE, então requisições concorrentes não passam do maxUses.
   */
  async reserve(couponId: string): Promise<void> {
    const afetadas = await prisma.$executeRaw`
      UPDATE coupons
         SET current_uses = current_uses + 1, updated_at = now()
       WHERE id = ${couponId}::uuid
         AND active = true
         AND (max_uses IS NULL OR current_uses < max_uses)
         AND (valid_until IS NULL OR valid_until > now())
    `;
    if (Number(afetadas) !== 1) throw new AppError('Cupom inválido ou expirado.', 400, 'INVALID_COUPON');
  },

  /** Devolve um uso reservado quando a cobrança não chegou a ser criada. */
  async release(couponId: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE coupons
         SET current_uses = GREATEST(current_uses - 1, 0), updated_at = now()
       WHERE id = ${couponId}::uuid
    `;
  },

  async validateAndApply(code: string, originalAmount: number) {
    const result = await this.validate(code, originalAmount);
    if (result.coupon) await this.reserve((result.coupon as { id: string }).id);
    return result;
  },
};
