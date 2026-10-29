import { logger } from '../logger';
import type { IAuditEventPublisher } from './audit-event-publisher';
import { LogAuditPublisher } from './log-audit-publisher';

// Única línea de composición del mecanismo de auditoría (AUDIT_PUBLISHER=log|rabbitmq).
export function createAuditPublisher(kind: string): IAuditEventPublisher {
  switch (kind) {
    case 'log':
      return new LogAuditPublisher();
    // H4: case 'rabbitmq': return new RabbitMqAuditPublisher(...)
    default:
      logger.warn('AUDIT_PUBLISHER no disponible aún, se usa "log"', { requested: kind });
      return new LogAuditPublisher();
  }
}
