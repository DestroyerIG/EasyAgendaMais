import { z } from 'zod';
import { isValidCnpj, normalizeDocumentDigits } from '../../utils/cpfCnpj.js';

const horaHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM');
// CNPJ (MEI) da profissional, para o salão-parceiro. Vazio vira null; guarda só os dígitos.
const cnpj = z.preprocess(
  (v) => (v === undefined ? undefined : normalizeDocumentDigits(v) || null),
  z.string().refine(isValidCnpj, 'CNPJ inválido').nullable().optional(),
);
const percentual = z.number().min(0, 'Mínimo 0%').max(100, 'Máximo 100%');

const baseProfessional = z.object({
  name: z.string().min(2, 'Nome do profissional deve ter pelo menos 2 caracteres').max(255),
  photo: z.string().url('URL da foto inválida').optional().nullable(),
  breakStart: horaHHMM.nullable().optional(),
  breakEnd: horaHHMM.nullable().optional(),
  commissionServicePct: percentual.nullable().optional(),
  commissionProductPct: percentual.nullable().optional(),
  cnpj,
  especialidade: z.preprocess((v) => (typeof v === 'string' ? v.trim() || null : v), z.string().max(80).nullable().optional()),
});

const intervaloValido = (d: { breakStart?: string | null; breakEnd?: string | null }) => {
  const temInicio = Boolean(d.breakStart);
  const temFim = Boolean(d.breakEnd);
  if (temInicio !== temFim) return false;
  if (!temInicio) return true;
  return (d.breakStart as string) < (d.breakEnd as string);
};
const mensagemIntervalo = { message: 'Informe início e fim do intervalo, com o fim depois do início', path: ['breakEnd'] };

export const createProfessionalSchema = baseProfessional.refine(intervaloValido, mensagemIntervalo);
export const updateProfessionalSchema = baseProfessional.partial().refine(intervaloValido, mensagemIntervalo);

export type CreateProfessional = z.infer<typeof createProfessionalSchema>;
export type UpdateProfessional = z.infer<typeof updateProfessionalSchema>;
