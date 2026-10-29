import type { ActualizarVehiculoRequest, CrearVehiculoRequest } from '@smartparking/contracts';
import { emitirAuditoria, type IAuditEventPublisher } from '../audit/audit-event-publisher';
import type { CacheService } from '../cache/cache.service';
import type { Actor } from '../auth/auth.types';
import type { ClienteRepository } from '../clientes/cliente.repository';
import { ConflictError, NotFoundError } from '../shared/errors';
import { BadRequest } from '../shared/bad-request';
import type { Vehiculo, VehiculoRepository } from './vehiculo.repository';

// "sba  1234" -> "SBA 1234"
export const normalizarMatricula = (m: string) => m.trim().replace(/\s+/g, ' ').toUpperCase();

const datosVehiculo = (actor: Actor, v: Vehiculo) => ({
  clienteId: v.clienteId,
  matricula: v.matricula,
  marca: v.marca,
  modelo: v.modelo,
  ...(actor.isAdmin ? {} : { identityUserId: actor.userId }),
});

export class VehiculosService {
  constructor(
    private readonly repo: VehiculoRepository,
    private readonly clientes: Pick<ClienteRepository, 'findById'>,
    private readonly audit: IAuditEventPublisher,
    private readonly cache?: Pick<CacheService, 'invalidateReservas'>,
  ) {}

  // CLIENTE: clienteId siempre del token (el del body se ignora). ADMIN: debe enviarlo.
  async crear(actor: Actor, req: CrearVehiculoRequest): Promise<Vehiculo> {
    let clienteId = actor.clienteId;
    if (actor.isAdmin) {
      if (!req.clienteId) throw new BadRequest('clienteId es obligatorio para ADMIN');
      if (!(await this.clientes.findById(req.clienteId))) throw new NotFoundError('Cliente no encontrado');
      clienteId = req.clienteId;
    }
    const v = await this.repo.create({
      matricula: normalizarMatricula(req.matricula),
      marca: req.marca,
      modelo: req.modelo,
      clienteId: clienteId!,
    });
    emitirAuditoria(this.audit, 'CREAR', 'Vehiculo', v.id, actor.userId, datosVehiculo(actor, v));
    return v;
  }

  // CLIENTE: solo los suyos. ADMIN: todos, filtrables por clienteId.
  list(actor: Actor, clienteId?: string): Promise<Vehiculo[]> {
    return this.repo.list({ clienteId: actor.isAdmin ? clienteId : actor.clienteId });
  }

  // 404 tanto si no existe como si es ajeno (no se filtra la existencia).
  async obtener(actor: Actor, id: string): Promise<Vehiculo> {
    const v = await this.repo.findById(id);
    if (!v || (!actor.isAdmin && v.clienteId !== actor.clienteId)) throw new NotFoundError('Vehículo no encontrado');
    return v;
  }

  async actualizar(actor: Actor, id: string, req: ActualizarVehiculoRequest): Promise<Vehiculo> {
    await this.obtener(actor, id);
    const data = { ...req, ...(req.matricula ? { matricula: normalizarMatricula(req.matricula) } : {}) };
    const v = await this.repo.update(id, data);
    emitirAuditoria(this.audit, 'MODIFICAR', 'Vehiculo', v.id, actor.userId, datosVehiculo(actor, v));
    return v;
  }

  async eliminar(actor: Actor, id: string): Promise<void> {
    const v = await this.obtener(actor, id);
    if ((await this.repo.countReservasActivas(id)) > 0) {
      throw new ConflictError('No se puede eliminar un vehículo con reservas activas');
    }
    await this.repo.delete(id);
    // El borrado elimina también reservas CANCELADAS: los listados cacheados deben invalidarse.
    await this.cache?.invalidateReservas(v.clienteId);
    emitirAuditoria(this.audit, 'ELIMINAR', 'Vehiculo', id, actor.userId, { clienteId: v.clienteId });
  }
}
