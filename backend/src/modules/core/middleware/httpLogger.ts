import type { Request, Response, NextFunction } from 'express';
import logger from '../../../utils/logger.js';

/** Remove a query string e mascara tokens em caminhos como /convites/:token e /avaliacoes/:token. */
export function urlParaLog(originalUrl: string): string {
  const semQuery = (originalUrl || '').split('?')[0] ?? '';
  return semQuery.replace(/\/(convites|avaliacoes)\/[^/]+/gi, '/$1/[token]');
}

export function httpLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]({
      requestId: req.requestId,
      method: req.method,
      url: urlParaLog(req.originalUrl),
      status: res.statusCode,
      duration,
      ip: req.ip,
      businessId: req.user?.businessId,
    }, 'request');
  });

  next();
}
