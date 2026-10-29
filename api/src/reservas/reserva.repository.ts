import type { EstadoReserva, ReservaFiltroDTO } from '@smartparking/contracts';
import type { Db } from '../db/prisma';
import { isExclusionViolation, isNotFound } from '../db/pg-errors';
import { ConflictError, NotFoundError } from '../shared/errors';
import type { Page } from '../shared/page';

export const MSG_SOLAPAMIENTO = 'El vehículo ya tiene una reserva activa en ese horario';

export interface Reserva {
  id: string;
  clienteId: string;
  vehiculoId: string;
  inicio: Date;
  fin: Date;
  estado: EstadoReserva;
}

export interface ReservaRepository {
  create(data: { clienteId: string; vehiculoId: string; inicio: Date; fin: Date }): Promise<Reserva>;
  findById(id: string): Promise<Reserva | null>;
  update(id: string, data: { inicio?: Date; fin?: Date; estado?: EstadoReserva }): Promise<Reserva>;
  // Hay otra reserva ACTIVA del vehículo que se solapa con [inicio, fin)?
  existsOverlap(vehiculoId: string, inicio: Date, fin: Date, excludeId?: string): Promise<boolean>;
  listByCliente(clienteId: string): Promise<Reserva[]>;
  search(filtro: ReservaFiltroDTO): Promise<Page<Reserva>>;
}

export class PrismaReservaRepository implements ReservaRepository {
  constructor(private readonly db: Db) {}

  // Último recurso ante carreras: la constraint EXCLUDE de Postgres (23P01) se traduce a 409.
  private translate(e: unknown): never {
    if (isExclusionViolation(e)) throw new ConflictError(MSG_SOLAPAMIENTO);
    if (isNotFound(e)) throw new NotFoundError('Reserva no encontrada');
    throw e;
  }

  async create(data: { clienteId: string; vehiculoId: string; inicio: Date; fin: Date }) {
    try {
      return await this.db.primary.reserva.create({ data });
    } catch (e) {
      this.translate(e);
    }
  }

  findById(id: string) {
    return this.db.primary.reserva.findUnique({ where: { id } });
  }

  async update(id: string, data: { inicio?: Date; fin?: Date; estado?: EstadoReserva }) {
    try {
      return await this.db.primary.reserva.update({ where: { id }, data });
    } catch (e) {
      this.translate(e);
    }
  }

  async existsOverlap(vehiculoId: string, inicio: Date, fin: Date, excludeId?: string) {
    const r = await this.db.primary.reserva.findFirst({
      where: {
        vehiculoId,
        estado: 'ACTIVA',
        inicio: { lt: fin },
        fin: { gt: inicio },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return r !== null;
  }

  listByCliente(clienteId: string) {
    return this.db.replica.reserva.findMany({ where: { clienteId }, orderBy: { inicio: 'desc' } });
  }

  async search(f: ReservaFiltroDTO): Promise<Page<Reserva>> {
    // desde/hasta: reservas que intersectan el rango [desde, hasta].
    const where = {
      ...(f.clienteId ? { clienteId: f.clienteId } : {}),
      ...(f.estado ? { estado: f.estado } : {}),
      ...(f.desde ? { fin: { gt: new Date(f.desde) } } : {}),
      ...(f.hasta ? { inicio: { lt: new Date(f.hasta) } } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.replica.reserva.findMany({
        where,
        orderBy: { inicio: 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
      this.db.replica.reserva.count({ where }),
    ]);
    return { items, total, page: f.page, pageSize: f.pageSize };
  }
}
