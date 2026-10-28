import express from 'express';
import type { Env } from './config/env';
import type { KeyPair } from './keys/key-provider';
import type { UserRepository } from './users/user.repository';
import { PasswordHasher } from './users/password-hasher';
import { CredentialValidator } from './auth/credential-validator';
import { TokenIssuer } from './auth/token-issuer';
import { AuthController } from './auth/auth.controller';
import { authRoutes } from './auth/auth.routes';
import { UserAdminController } from './users/user-admin.controller';
import { usersRoutes } from './users/users.routes';
import { requireAdmin } from './middlewares/require-admin';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';

export interface AppDeps {
  env: Pick<Env, 'JWT_ISSUER' | 'JWT_EXPIRES_IN' | 'BCRYPT_ROUNDS'>;
  keys: KeyPair;
  repo: UserRepository;
  isReady?: () => boolean;
}

// Composición de dependencias (inyectables para los tests).
export function createApp({ env, keys, repo, isReady = () => true }: AppDeps) {
  const hasher = new PasswordHasher(env.BCRYPT_ROUNDS);
  const issuer = new TokenIssuer(keys, env.JWT_ISSUER, env.JWT_EXPIRES_IN);
  const authController = new AuthController(new CredentialValidator(repo, hasher), issuer, keys);
  const userAdminController = new UserAdminController(hasher, repo);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  const health: express.RequestHandler = (_req, res) => {
    const ok = isReady();
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'unavailable' });
  };
  app.get('/health', health);
  app.get('/auth/health', health); // accesible vía Nginx bajo /auth

  app.use(authRoutes(authController));
  app.use(usersRoutes(userAdminController, requireAdmin(issuer)));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
