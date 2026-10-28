import { Router } from 'express';
import type { AuthController } from './auth.controller';

export const authRoutes = (c: AuthController) => {
  const r = Router();
  r.post('/auth/login', c.login); // IAuthApi
  r.get('/.well-known/jwks.json', c.getJwks); // IJwks
  r.get('/auth/.well-known/jwks.json', c.getJwks); // alias bajo /auth (accesible via Nginx)
  return r;
};
