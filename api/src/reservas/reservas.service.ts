import type { ActualizarReservaRequest, CrearReservaRequest, ReservaFiltroDTO } from '@smartparking/contracts';
import { emitirAuditoria, type IAuditEventPublisher } from '../audit/audit-event-publisher';
import type { Actor } from '../auth/auth.types';
import { BadRequest } from '../shared/bad-request';
import { ConflictError, NotFoundError } from '../shared/errors';
import type { Page } from '../shared/page';
import type { VehiculoRepository } from '../vehiculos/vehiculo.repository';
import { MSG_SOLAPAMIENTO, type Reserva, type ReservaRepository } from './reserva.repository';

export class ReservasService {
  constructor(
    private readonly repo: ReservaRepository,
    private readonly vehiculos: Pick<VehiculoRepository, 'findById'>,
    private readonly audit: IAuditEventPublisher,
  ) {}

  private validarRango(inicio: Date, fin: Date) {
    if (!(fin > inicio)) throw new BadRequest('fin debe ser posterior a inicio');
  }

  // RF3. La reserva pertenece al cliente dueño del vehículo; un CLIENTE solo puede usar sus vehículos
  // (404 si es ajeno, para no filtrar existencia). El clienteId nunca viene del request.
  async crear(actor: Actor, req: CrearReservaRequest): Promise<Reserva> {
    const inicio = new Date(req.inicio);
    const fin = new Date(req.fin);
    this.validarRango(inicio, fin);

    const vehiculo = await this.vehiculos.findById(req.vehiculoId);
    if (!vehiculo || (!actor.isAdmin && vehiculo.clienteId !== actor.clienteId)) {
      throw new NotFoundError('Vehículo no encontrado');
    }
    if (await this.repo.existsOverlap(vehiculo.id, inicio, fin)) throw new ConflictError(MSG_SOLAPAMIENTO);

    const reserva = await this.repo.create({ clienteId: vehiculo.clienteId, vehiculoId: vehiculo.id, inicio, fin });
    emitirAuditoria(this.audit, 'CREAR', 'Reserva', reserva.id, actor.userId);
    return reserva;
  }

  async obtener(actor: Actor, id: string): Promise<Reserva> {
    const r = await this.repo.findById(id);
    if (!r || (!actor.isAdmin && r.clienteId !== actor.clienteId)) throw new NotFoundError('Reserva no encontrada');
    return r;
  }

  async modificar(actor: Actor, id: string, req: ActualizarReservaRequest): Promise<Reserva> {
    const actual = await this.obtener(actor, id);
    if (actual.estado !== 'ACTIVA') throw new ConflictError('Solo se pueden modificar reservas activas');
    const inicio = new Date(req.inicio);
    const fin = new Date(req.fin);
    this.validarRango(inicio, fin);
    if (await this.repo.existsOverlap(actual.vehiculoId, inicio, fin, actual.id)) {
      throw new ConflictError(MSG_SOLAPAMIENTO);
    }
    const r = await this.repo.update(id, { inicio, fin });
    emitirAuditoria(this.audit, 'MODIFICAR', 'Reserva', r.id, actor.userId);
    return r;
  }

  // Cancelar = estado CANCELADA (no se borra). Idempotente: si ya estaba cancelada no se audita de nuevo.
  async cancelar(actor: Actor, id: string): Promise<Reserva> {
    const actual = await this.obtener(actor, id);
    if (actual.estado === 'CANCELADA') return actual;
    const r = await this.repo.update(id, { estado: 'CANCELADA' });
    emitirAuditoria(this.audit, 'CANCELAR', 'Reserva', r.id, actor.userId);
    return r;
  }

  // RF4: el cliente sale exclusivamente del JWT (actor.clienteId).
  misReservas(actor: Actor): Promise<Reserva[]> {
    return this.repo.listByCliente(actor.clienteId!);
  }

  // RF5
  buscar(filtro: ReservaFiltroDTO): Promise<Page<Reserva>> {
    if (filtro.desde && filtro.hasta && new Date(filtro.hasta) <= new Date(filtro.desde)) {
      throw new BadRequest('hasta debe ser posterior a desde');
    }
    return this.repo.search(filtro);
  }
}
