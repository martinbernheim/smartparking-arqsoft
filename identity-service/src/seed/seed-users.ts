import type { Rol } from '@smartparking/contracts';
import type { Env } from '../config/env';
import { logger } from '../logger';
import type { PasswordHasher } from '../users/password-hasher';
import type { UserRepository } from '../users/user.repository';

// Seed idempotente: crea solo los usuarios que no existen.
export async function seedUsers(env: Env, repo: UserRepository, hasher: PasswordHasher) {
  const seeds: { email?: string; password?: string; id?: string; rol: Rol }[] = [
    { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD, rol: 'ADMIN' },
    { email: env.SEED_CLIENT1_EMAIL, password: env.SEED_CLIENT1_PASSWORD, id: env.SEED_CLIENT1_ID, rol: 'CLIENTE' },
    { email: env.SEED_CLIENT2_EMAIL, password: env.SEED_CLIENT2_PASSWORD, id: env.SEED_CLIENT2_ID, rol: 'CLIENTE' },
  ];
  for (const s of seeds) {
    if (!s.email || !s.password) continue;
    let user = await repo.findByEmail(s.email);
    if (!user) {
      user = await repo.create({
        id: s.id,
        email: s.email,
        passwordHash: await hasher.hash(s.password),
        roles: [s.rol],
      });
      logger.info('Usuario seed creado', { email: user.email, rol: s.rol, identityUserId: user.id });
    } else {
      logger.info('Usuario seed existente', { email: user.email, rol: s.rol, identityUserId: user.id });
    }
  }
}
