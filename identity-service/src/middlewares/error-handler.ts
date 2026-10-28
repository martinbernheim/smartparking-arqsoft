import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, NotFoundError } from '../shared/errors';
import { logger } from '../logger';

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(new NotFoundError());

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Solicitud inválida', details: err.issues });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // JSON mal formado
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }
  logger.error('Error no controlado', { message: err?.message, stack: err?.stack });
  res.status(500).json({ error: 'Error interno' });
};
