import { randomUUID } from 'node:crypto';
import type { EventoAuditoriaDTO } from '@smartparking/contracts';
import { logger } from '../logger';

// Puerto interno (ADR-01). Los módulos CRUD dependen solo de esta interfaz.
export interface IAuditEventPublisher {
  publicar(evento: EventoAuditoriaDTO): Promise<void>;
}

export type TipoAuditoria = EventoAuditoriaDTO['tipo'];

// Se invoca DESPUÉS del commit. Nunca propaga errores: el CRUD no depende de la auditoría.
// No bloquea la respuesta (fire-and-forget con captura de errores).
export function emitirAuditoria(
  publisher: IAuditEventPublisher,
  tipo: TipoAuditoria,
  entidad: 'Cliente' | 'Vehiculo' | 'Reserva',
  entidadId: string,
  userId: string,
): void {
  const evento: EventoAuditoriaDTO = {
    eventId: randomUUID(),
    tipo,
    entidad,
    entidadId,
    userId,
    fechaHora: new Date().toISOString(),
  };
  try {
    publisher.publicar(evento).catch((e) =>
      logger.error('Fallo al publicar evento de auditoría', { evento, reason: (e as Error)?.message }),
    );
  } catch (e) {
    logger.error('Fallo al publicar evento de auditoría', { evento, reason: (e as Error)?.message });
  }
}
