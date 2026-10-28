import type { RequestHandler } from 'express';
import type { TokenIssuer } from '../auth/token-issuer';
import { ForbiddenError, UnauthorizedError } from '../shared/errors';

// Exige Bearer JWT valido (firma propia) con rol ADMIN.
export const requireAdmin = (tokens: TokenIssuer): RequestHandler => (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new UnauthorizedError());
  let payload;
  try {
    payload = tokens.verify(header.slice(7));
  } catch {
    return next(new UnauthorizedError('Token invalido o expirado'));
  }
  const roles: string[] = Array.isArray(payload.roles) ? payload.roles : [];
  if (!roles.includes('ADMIN')) return next(new ForbiddenError());
  next();
};
