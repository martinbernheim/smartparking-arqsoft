import type { Request, Response } from 'express';
import { CrearUsuarioRequestSchema, type CrearUsuarioResponse } from '@smartparking/contracts';
import { ConflictError } from '../shared/errors';
import type { PasswordHasher } from './password-hasher';
import type { UserRepository } from './user.repository';

export class UserAdminController {
  constructor(private readonly hasher: PasswordHasher, private readonly repo: UserRepository) {}

  create = async (req: Request, res: Response) => {
    const { email, password, rol } = CrearUsuarioRequestSchema.parse(req.body);
    if (await this.repo.findByEmail(email)) throw new ConflictError('El email ya está registrado');
    const user = await this.repo.create({
      email,
      passwordHash: await this.hasher.hash(password),
      roles: [rol],
    });
    const body: CrearUsuarioResponse = { identityUserId: user.id };
    res.status(201).json(body);
  };
}
