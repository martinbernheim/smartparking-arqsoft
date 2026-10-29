import type { Rol } from '@smartparking/contracts';

export interface AuthUser {
  sub: string;
  roles: Rol[];
  token: string; // JWT original (se reenvía a Identity en IUserAdmin, D9)
}

// Quién actúa sobre un recurso: ADMIN (sin restricción) o CLIENTE con su clienteId resuelto.
export interface Actor {
  userId: string;
  isAdmin: boolean;
  clienteId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      actor?: Actor;
    }
  }
}
