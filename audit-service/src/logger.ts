import winston from 'winston';

// Log técnico en JSON por stdout.
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'audit-service' },
  transports: [new winston.transports.Console()],
});
