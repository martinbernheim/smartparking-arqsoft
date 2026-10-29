import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { RolSchema, type Rol } from '@smartparking/contracts';
import { UnauthorizedError } from '../shared/errors';
import type { IJwks } from './jwks-client';

// JwtAuthMiddleware: verifica firma RS256 (clave pública vía IJwks), exp e iss. Deja req.user {sub, roles}.
export const jwtAuth = (jwks: IJwks, issuer: string): RequestHandler => async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedError();
  const token = header.slice(7).trim();

  const decoded = jwt.decode(token, { complete: true });
  const kid = decoded?.header.kid;
  if (!decoded || decoded.header.alg !== 'RS256' || !kid) throw new UnauthorizedError('Token invalido');

  const key = await jwks.getKey(kid);
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, key, { algorithms: ['RS256'], issuer }) as jwt.JwtPayload;
  } catch {
    throw new UnauthorizedError('Token invalido o expirado');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) throw new UnauthorizedError('Token invalido');

  const roles: Rol[] = (Array.isArray(payload.roles) ? payload.roles : []).flatMap((r: unknown) => {
    const p = RolSchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
  req.user = { sub: payload.sub, roles, token };
  next();
};
