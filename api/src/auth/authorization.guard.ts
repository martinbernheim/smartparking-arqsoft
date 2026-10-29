import type { RequestHandler } from 'express';
import type { Rol } from '@smartparking/contracts';
import { ForbiddenError, UnauthorizedError } from '../shared/errors';

// AuthorizationGuard: requireRole('ADMIN') -> 403 si el usuario no tiene alguno de los roles.
export const requireRole = (...roles: Rol[]): RequestHandler => (req, _res, next) => {
  if (!req.user) return next(new UnauthorizedError());
  if (!req.user.roles.some((r) => roles.includes(r))) return next(new ForbiddenError());
  next();
};
