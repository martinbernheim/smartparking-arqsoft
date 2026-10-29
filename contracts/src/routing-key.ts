import type { EventoAuditoriaDTO } from './evento-auditoria.dto';

export const AUDIT_EXCHANGE = 'smartparking.events';

const PARTICIPIO: Record<EventoAuditoriaDTO['tipo'], string> = {
  CREAR: 'creada',
  MODIFICAR: 'modificada',
  CANCELAR: 'cancelada',
  ELIMINAR: 'eliminada',
};

// Routing key del exchange topic `smartparking.events`: `<entidad>.<accion>` en minúsculas.
// Ej.: reserva.creada, reserva.cancelada, cliente.creado, vehiculo.eliminado.
// Compartido por publicadores (API) y suscriptores (Audit Service).
export function routingKeyFor(evento: Pick<EventoAuditoriaDTO, 'tipo' | 'entidad'>): string {
  const entidad = evento.entidad.toLowerCase();
  let accion = PARTICIPIO[evento.tipo];
  // Concordancia de género: Reserva -> creada; Cliente/Vehiculo (masculino) -> creado.
  if (entidad !== 'reserva') accion = accion.replace(/a$/, 'o');
  return `${entidad}.${accion}`;
}
