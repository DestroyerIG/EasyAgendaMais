import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { validate } from '../../middleware/validate.js';
import { GetPublicAvailabilitySchema, CreatePublicAppointmentSchema } from './publicBooking.types.js';
import { getStorefront, getProfessionals, getAvailability, createAppointment } from './publicBooking.controller.js';

const router = express.Router();

const createAppointmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_PUBLIC_BOOKING', message: 'Muitas tentativas. Tente novamente em alguns minutos.' },
  },
});

router.get('/:slug', getStorefront);
router.get('/:slug/professionals', getProfessionals);
router.get('/:slug/availability', validate({ query: GetPublicAvailabilitySchema }), getAvailability);
router.post('/:slug/appointments', createAppointmentLimiter, validate({ body: CreatePublicAppointmentSchema }), createAppointment);

export default router;
