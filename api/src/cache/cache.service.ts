import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import type { ReservaFiltroDTO } from '@smartparking/contracts';
import { logger } from '../logger';

// Subconjunto de ioredis utilizado (permite un fake en los tests).
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  incr(key: string): Promise<number>;
}

export type CacheStatus = 'HIT' | 'MISS';

export const ADMIN_VER_KEY = 'reservas:admin:ver';
export const miasKey = (clienteId: string) => `reservas:mias:${clienteId}`;

// Hash estable de los filtros normalizados (claves ordenadas, sin valores vacíos).
export function hashFiltro(filtro: ReservaFiltroDTO): string {
  const norm = Object.fromEntries(
    Object.entries(filtro)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return createHash('sha1').update(JSON.stringify(norm)).digest('hex').slice(0, 16);
}

// Cache-aside sobre Redis (A2: caché de consultas). Cualquier fallo de Redis degrada a "MISS":
// se registra y se consulta la BD. `client` nulo = caché deshabilitada.
export class CacheService {
  constructor(
    private readonly client: RedisLike | null,
    private readonly ttlSeconds = 30,
  ) {}

  private async safe<T>(op: string, fn: (c: RedisLike) => Promise<T>, fallback: T): Promise<T> {
    if (!this.client) return fallback;
    try {
      return await fn(this.client);
    } catch (e) {
      logger.warn('CACHE_ERROR: se continúa sin caché', { op, reason: (e as Error)?.message });
      return fallback;
    }
  }

  getJson<T>(key: string): Promise<T | null> {
    return this.safe(
      'get',
      async (c) => {
        const raw = await c.get(key);
        return raw === null ? null : (JSON.parse(raw) as T);
      },
      null,
    );
  }

  async setJson(key: string, value: unknown): Promise<void> {
    await this.safe('set', (c) => c.set(key, JSON.stringify(value), 'EX', this.ttlSeconds), undefined);
  }

  // La versión de los listados admin forma parte de la clave: incrementarla los invalida sin SCAN.
  private adminVersion(): Promise<string> {
    return this.safe('ver', async (c) => (await c.get(ADMIN_VER_KEY)) ?? '0', '0');
  }

  async adminKey(filtro: ReservaFiltroDTO): Promise<string> {
    return `reservas:admin:${await this.adminVersion()}:${hashFiltro(filtro)}`;
  }

  /** Invalidación tras cualquier comando de reserva. */
  async invalidateReservas(clienteId: string): Promise<void> {
    await this.safe(
      'invalidate',
      async (c) => {
        await c.del(miasKey(clienteId));
        await c.incr(ADMIN_VER_KEY);
      },
      undefined,
    );
  }
}

export function createRedisClient(url: string): RedisLike {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false, // sin Redis falla rápido y se degrada a BD
    commandTimeout: 500,
    retryStrategy: (n) => Math.min(n * 200, 2000),
  });
  let lastLog = 0;
  redis.on('error', (e) => {
    if (Date.now() - lastLog > 10_000) {
      lastLog = Date.now();
      logger.warn('Redis no disponible', { reason: e?.message });
    }
  });
  return redis as unknown as RedisLike;
}
