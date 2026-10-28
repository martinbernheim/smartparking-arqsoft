import { UnauthorizedError } from '../shared/errors';
import type { PasswordHasher } from '../users/password-hasher';
import type { User, UserRepository } from '../users/user.repository';

export class CredentialValidator {
  private dummyHash: Promise<string>;

  constructor(private readonly repo: UserRepository, private readonly hasher: PasswordHasher) {
    this.dummyHash = hasher.hash('dummy-password');
  }

  // Mismo error para usuario inexistente y clave errónea (y tiempo similar).
  async validate(email: string, password: string): Promise<User> {
    const user = await this.repo.findByEmail(email);
    const ok = await this.hasher.compare(password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !ok) throw new UnauthorizedError('Credenciales inválidas');
    return user;
  }
}
