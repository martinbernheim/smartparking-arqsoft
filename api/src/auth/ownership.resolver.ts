import type { RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../shared/errors';

export interface ClienteLookup {
  findClienteIdByIdentityUserId(identityUserId: string): Promise<string | null>;
}

// OwnershipResolver: sub (JWT) -> Cliente.identityUserId -> clienteId. El clienteId de un CLIENTE
// NUNCA se toma del request (body/query/params); solo de este mapeo.
export class OwnershipResolver {
  constructor(private readonly clientes: ClienteLookup) {}

  async resolveClienteId(sub: string): Promise<string> {
    const id = await this.clientes.findClienteIdByIdentityUserId(sub);
    if (!id) throw new ForbiddenError('El usuario no tiene un cliente asociado');
    return id;
  }

  // Middleware: deja req.actor. ADMIN sin restricción; CLIENTE con clienteId resuelto (403 si no existe).
  actor(): RequestHandler {
    return async (req, _res, next) => {
      const user = req.user;
      if (!user) throw new UnauthorizedError();
      if (user.roles.includes('ADMIN')) {
        req.actor = { userId: user.sub, isAdmin: true };
      } else {
        req.actor = { userId: user.sub, isAdmin: false, clienteId: await this.resolveClienteId(user.sub) };
      }
      next();
    };
  }
}
