import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole, requireTenantRoles } from '../../middleware/rbac.js';
import { baixarBackup, estadoDaConta } from './conta.controller.js';

const router = express.Router();

// Sem requireFeature: estado e backup valem em qualquer plano e estado da conta
// (o authMiddleware já isenta o GET dessas duas rotas do bloqueio de assinatura).
router.get('/estado', authMiddleware, requireTenantRoles, estadoDaConta);
router.get('/backup', authMiddleware, requireTenantRoles, requireRole(['tenant_admin']), baixarBackup);

export default router;
