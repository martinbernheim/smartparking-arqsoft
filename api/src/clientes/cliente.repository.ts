import type { ClienteLookup } from '../auth/ownership.resolver';
import type { Db } from '../db/prisma';
import { isForeignKeyViolation, isNotFound, isUniqueViolation, uniqueTarget } from '../db/pg-errors';
import { ConflictError, NotFoundError } from '../shared/errors';
import type { Page } from '../shared/page';

export interface Cliente {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  identityUserId: string;
  createdAt: Date;
}

export interface NuevoCliente {
  nombre: string;
  email: string;
  telefono?: string | null;
  identityUserId: string;
}

export interface ClienteRepository extends ClienteLookup {
  create(data: NuevoCliente): Promise<Cliente>;
  findById(id: string): Promise<Cliente | null>;
  findByEmail(email: string): Promise<Cliente | null>;
  findByIdentityUserId(identityUserId: string): Promise<Cliente | null>;
  list(page: number, pageSize: number): Promise<Page<Cliente>>;
  update(id: string, data: { nombre?: string; telefono?: string | null }): Promise<Cliente>;
  countReservasActivas(id: string): Promise<number>;
  // Elimina el cliente junto con sus vehículos y reservas CANCELADAS (las ACTIVAS se validan antes).
  delete(id: string): Promise<void>;
}

export class PrismaClienteRepository implements ClienteRepository {
  constructor(private readonly db: Db) {}

  async create(data: NuevoCliente): Promise<Cliente> {
    try {
      return await this.db.primary.cliente.create({ data });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError(`Ya existe un cliente con ese ${uniqueTarget(e).includes('email') ? 'email' : 'usuario'}`);
      throw e;
    }
  }

  findById(id: string) {
    return this.db.primary.cliente.findUnique({ where: { id } });
  }
  findByEmail(email: string) {
    return this.db.primary.cliente.findUnique({ where: { email } });
  }
  findByIdentityUserId(identityUserId: string) {
    return this.db.primary.cliente.findUnique({ where: { identityUserId } });
  }
  async findClienteIdByIdentityUserId(identityUserId: string) {
    const c = await this.db.primary.cliente.findUnique({ where: { identityUserId }, select: { id: true } });
    return c?.id ?? null;
  }

  async list(page: number, pageSize: number): Promise<Page<Cliente>> {
    const [items, total] = await Promise.all([
      this.db.replica.cliente.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.db.replica.cliente.count(),
    ]);
    return { items, total, page, pageSize };
  }

  async update(id: string, data: { nombre?: string; telefono?: string | null }) {
    try {
      return await this.db.primary.cliente.update({ where: { id }, data });
    } catch (e) {
      if (isNotFound(e)) throw new NotFoundError('Cliente no encontrado');
      throw e;
    }
  }

  countReservasActivas(id: string) {
    return this.db.primary.reserva.count({ where: { clienteId: id, estado: 'ACTIVA' } });
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.primary.$transaction([
        this.db.primary.reserva.deleteMany({ where: { clienteId: id, estado: 'CANCELADA' } }),
        this.db.primary.vehiculo.deleteMany({ where: { clienteId: id } }),
        this.db.primary.cliente.delete({ where: { id } }),
      ]);
    } catch (e) {
      if (isNotFound(e)) throw new NotFoundError('Cliente no encontrado');
      if (isForeignKeyViolation(e)) throw new ConflictError('El cliente tiene reservas activas');
      throw e;
    }
  }
}
