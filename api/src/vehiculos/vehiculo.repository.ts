import type { Db } from '../db/prisma';
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from '../db/pg-errors';
import { ConflictError, NotFoundError } from '../shared/errors';

export interface Vehiculo {
  id: string;
  matricula: string;
  marca: string | null;
  modelo: string | null;
  clienteId: string;
}

export interface VehiculoRepository {
  create(data: { matricula: string; marca?: string; modelo?: string; clienteId: string }): Promise<Vehiculo>;
  findById(id: string): Promise<Vehiculo | null>;
  list(filter: { clienteId?: string }): Promise<Vehiculo[]>;
  update(id: string, data: { matricula?: string; marca?: string | null; modelo?: string | null }): Promise<Vehiculo>;
  countReservasActivas(id: string): Promise<number>;
  // Elimina el vehículo y sus reservas CANCELADAS (las ACTIVAS se validan antes).
  delete(id: string): Promise<void>;
}

const MATRICULA_DUP = 'Ya existe un vehículo con esa matrícula';

export class PrismaVehiculoRepository implements VehiculoRepository {
  constructor(private readonly db: Db) {}

  async create(data: { matricula: string; marca?: string; modelo?: string; clienteId: string }) {
    try {
      return await this.db.primary.vehiculo.create({ data });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError(MATRICULA_DUP);
      if (isForeignKeyViolation(e)) throw new NotFoundError('Cliente no encontrado');
      throw e;
    }
  }

  findById(id: string) {
    return this.db.primary.vehiculo.findUnique({ where: { id } });
  }

  list(filter: { clienteId?: string }) {
    return this.db.replica.vehiculo.findMany({ where: filter, orderBy: { matricula: 'asc' } });
  }

  async update(id: string, data: { matricula?: string; marca?: string | null; modelo?: string | null }) {
    try {
      return await this.db.primary.vehiculo.update({ where: { id }, data });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError(MATRICULA_DUP);
      if (isNotFound(e)) throw new NotFoundError('Vehículo no encontrado');
      throw e;
    }
  }

  countReservasActivas(id: string) {
    return this.db.primary.reserva.count({ where: { vehiculoId: id, estado: 'ACTIVA' } });
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.primary.$transaction([
        this.db.primary.reserva.deleteMany({ where: { vehiculoId: id, estado: 'CANCELADA' } }),
        this.db.primary.vehiculo.delete({ where: { id } }),
      ]);
    } catch (e) {
      if (isNotFound(e)) throw new NotFoundError('Vehículo no encontrado');
      if (isForeignKeyViolation(e)) throw new ConflictError('El vehículo tiene reservas activas');
      throw e;
    }
  }
}
