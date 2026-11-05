import express from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { validate } from '../../middleware/validate.js';
import { GetPublicAvailabilitySchema, GetPublicDaysSchema, PublicAppointmentParamsSchema, CreatePublicAppointmentSchema } from './publicBooking.types.js';
import {
  getStorefront, getProfessionals, getAvailability, getAvailabilityGrid, getAvailabilityDays, getAppointmentStatus, createAppointment,
} from './publicBooking.controller.js';
import { AdesaoSchema } from '../clube/clube.types.js';
import { publicClub, publicClubs, publicJoin } from '../clube/clube.controller.js';

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

const adesaoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_PUBLIC_CLUB', message: 'Muitas tentativas. Tente novamente em alguns minutos.' },
  },
});

router.get('/:slug', getStorefront);
router.get('/:slug/professionals', getProfessionals);
router.get('/:slug/availability', validate({ query: GetPublicAvailabilitySchema }), getAvailability);
router.get('/:slug/availability/grade', validate({ query: GetPublicAvailabilitySchema }), getAvailabilityGrid);
router.get('/:slug/availability/dias', validate({ query: GetPublicDaysSchema }), getAvailabilityDays);
router.get('/:slug/appointments/:id/status', validate({ params: PublicAppointmentParamsSchema }), getAppointmentStatus);
router.post('/:slug/appointments', createAppointmentLimiter, validate({ body: CreatePublicAppointmentSchema }), createAppointment);

router.get('/:slug/clube', publicClubs);
router.get('/:slug/clube/:ofertaId', validate({ params: z.object({ slug: z.string(), ofertaId: z.string().uuid() }) }), publicClub);
router.post('/:slug/clube/:ofertaId/adesao', adesaoLimiter,
  validate({ params: z.object({ slug: z.string(), ofertaId: z.string().uuid() }), body: AdesaoSchema }), publicJoin);

export default router;
