import type { EventoAuditoriaDTO } from '@smartparking/contracts';
import { logger } from '../logger';
import type { IAuditEventPublisher } from './audit-event-publisher';

// Adapter provisorio (H2/H3): escribe el evento en el log técnico. El adapter RabbitMQ llega en H4.
export class LogAuditPublisher implements IAuditEventPublisher {
  async publicar(evento: EventoAuditoriaDTO): Promise<void> {
    logger.info('AUDIT_EVENT', { audit: evento });
  }
}
