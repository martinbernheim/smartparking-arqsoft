import { AUDIT_EXCHANGE } from '@smartparking/contracts';
import { logger } from '../logger';
import type { IAuditEventPublisher } from './audit-event-publisher';
import { LogAuditPublisher } from './log-audit-publisher';
import { RabbitMqAuditPublisher } from './rabbitmq-audit-publisher';

export interface AuditFactoryOptions {
  rabbitmqUrl?: string;
  exchange?: string;
}

// Única línea de composición del mecanismo de auditoría (AUDIT_PUBLISHER=log|rabbitmq).
export function createAuditPublisher(kind: string, opts: AuditFactoryOptions = {}): IAuditEventPublisher {
  switch (kind) {
    case 'rabbitmq':
      return new RabbitMqAuditPublisher({
        url: opts.rabbitmqUrl ?? 'amqp://guest:guest@localhost:5672',
        exchange: opts.exchange ?? AUDIT_EXCHANGE,
      });
    case 'log':
      return new LogAuditPublisher();
    default:
      logger.warn('AUDIT_PUBLISHER desconocido, se usa "log"', { requested: kind });
      return new LogAuditPublisher();
  }
}
