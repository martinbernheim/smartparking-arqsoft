import { EventoAuditoriaDTOSchema, type EventoAuditoriaDTO } from '@smartparking/contracts';
import { computeResumen } from '../domain/resumen';
import type { ResumenCliente } from '../domain/types';
import type { ReadModelStore } from '../store/store';

export type ProjectionResult = 'aplicado' | 'duplicado' | 'ignorado';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const optStr = (v: unknown): string | null | undefined => (v === null ? null : str(v));

/**
 * Proyector (lado QUERY de CQRS). Cada evento actualiza el estado por entidad (last-write-wins por
 * fechaHora, tolerante a desorden) y recalcula el resumen del cliente afectado. Idempotente por eventId;
 * además, al ser un reemplazo de estado, reaplicar un evento no altera los contadores.
 */
export class Projector {
  constructor(
    private readonly store: ReadModelStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async apply(raw: unknown): Promise<ProjectionResult> {
    const evento = EventoAuditoriaDTOSchema.parse(raw);
    if (await this.store.wasProcessed(evento.eventId)) return 'duplicado';

    const afectado = await this.project(evento);
    if (afectado) await this.recompute(afectado);
    await this.store.markProcessed(evento.eventId);
    return afectado === undefined ? 'ignorado' : 'aplicado';
  }

  /** Devuelve el clienteId a recalcular (undefined = evento que no aplica; null = cliente purgado). */
  private async project(e: EventoAuditoriaDTO): Promise<string | null | undefined> {
    const d = e.datos ?? {};
    switch (e.entidad.toLowerCase()) {
      case 'reserva': {
        if (e.tipo === 'ELIMINAR') {
          const prev = await this.store.getReserva(e.entidadId);
          await this.store.deleteReserva(e.entidadId);
          return prev?.clienteId ?? str(d.clienteId);
        }
        const clienteId = str(d.clienteId);
        const vehiculoId = str(d.vehiculoId);
        const inicio = str(d.inicio);
        const fin = str(d.fin);
        if (!clienteId || !vehiculoId || !inicio || !fin) return undefined; // evento legado sin snapshot
        const estado = d.estado === 'CANCELADA' || e.tipo === 'CANCELAR' ? 'CANCELADA' : 'ACTIVA';
        await this.store.putReserva({ reservaId: e.entidadId, clienteId, vehiculoId, inicio, fin, estado, version: e.fechaHora });
        const identityUserId = str(d.identityUserId);
        if (identityUserId) await this.store.mergeCliente(clienteId, { identityUserId });
        return clienteId;
      }
      case 'vehiculo': {
        if (e.tipo === 'ELIMINAR') {
          const prev = await this.store.getVehiculo(e.entidadId);
          await this.store.deleteVehiculo(e.entidadId);
          return prev?.clienteId ?? str(d.clienteId);
        }
        const clienteId = str(d.clienteId);
        if (!clienteId) return undefined;
        await this.store.putVehiculo({
          vehiculoId: e.entidadId,
          clienteId,
          matricula: str(d.matricula),
          marca: optStr(d.marca),
          modelo: optStr(d.modelo),
          version: e.fechaHora,
        });
        const identityUserId = str(d.identityUserId);
        if (identityUserId) await this.store.mergeCliente(clienteId, { identityUserId });
        return clienteId;
      }
      case 'cliente': {
        if (e.tipo === 'ELIMINAR') {
          await this.store.purgeCliente(e.entidadId);
          return null;
        }
        const fields = {
          ...(str(d.nombre) ? { nombre: str(d.nombre) } : {}),
          ...(str(d.email) ? { email: str(d.email) } : {}),
          ...(str(d.identityUserId) ? { identityUserId: str(d.identityUserId) } : {}),
        };
        await this.store.mergeCliente(e.entidadId, fields);
        return e.entidadId;
      }
      default:
        return undefined;
    }
  }

  async recompute(clienteId: string): Promise<ResumenCliente> {
    const { cliente, vehiculos, reservas } = await this.store.loadAgregado(clienteId);
    const resumen = computeResumen(clienteId, cliente, vehiculos, reservas, this.now());
    await this.store.saveResumen(resumen);
    return resumen;
  }
}
