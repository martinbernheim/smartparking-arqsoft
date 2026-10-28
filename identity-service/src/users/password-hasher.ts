import bcrypt from 'bcrypt';

export class PasswordHasher {
  constructor(private readonly rounds: number) {}
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }
  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
