import type { Rol } from '@smartparking/contracts';
import { ConflictError } from '../shared/errors';
import { UserModel } from './user.model';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  roles: Rol[];
}

export interface NewUser {
  id?: string; // opcional: ids deterministas para el seed
  email: string;
  passwordHash: string;
  roles: Rol[];
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  create(user: NewUser): Promise<User>;
}

export class MongoUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const doc = await UserModel.findOne({ email: email.toLowerCase().trim() });
    return doc && { id: doc.id, email: doc.email, passwordHash: doc.passwordHash, roles: doc.roles };
  }

  async create(user: NewUser): Promise<User> {
    try {
      const doc = await UserModel.create({
        ...(user.id ? { _id: user.id } : {}),
        email: user.email,
        passwordHash: user.passwordHash,
        roles: user.roles,
      });
      return { id: doc.id, email: doc.email, passwordHash: doc.passwordHash, roles: doc.roles };
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictError('El email ya está registrado');
      throw e;
    }
  }
}
