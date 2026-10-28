import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { auditLogService } from '../../services/auditLogService.js';
import { estadoContaService } from './estadoConta.service.js';
import { backupService } from './backup.service.js';
import type { EstadoConta } from './estadoConta.rules.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const serializar = (e: EstadoConta) => {
  if (e.tipo === 'carencia') {
    return { tipo: e.tipo, desde: e.desde.toISOString(), ate: e.ate.toISOString(), diasRestantes: e.diasRestantes };
  }
  if (e.tipo === 'bloqueada') return { tipo: e.tipo, motivo: e.motivo };
  return { tipo: e.tipo };
};

export const estadoDaConta: H = async (req, res, next) => {
  try {
    const estado = req.estadoConta ?? (await estadoContaService.doNegocio(req.user.businessId!));
    sendSuccess(res, serializar(estado));
  } catch (e) { next(e); }
};

export const baixarBackup: H = async (req, res, next) => {
  try {
    const businessId = req.user.businessId!;
    const [zip, nome] = await Promise.all([backupService.gerar(businessId), backupService.identificador(businessId)]);
    await auditLogService.logAdminAction({
      req,
      actionType: 'conta_backup',
      actorUserId: req.user.userId,
      actorBusinessId: businessId,
      targetBusinessId: businessId,
      resourceType: 'business',
      resourceId: businessId,
    });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${nome}-${new Date().toISOString().slice(0, 10)}.zip"`);
    res.send(zip);
  } catch (e) { next(e); }
};
