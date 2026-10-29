import { createPublicKey, type KeyObject } from 'node:crypto';
import { ServiceUnavailableError, UnauthorizedError } from '../shared/errors';
import { logger } from '../logger';

// IJwks: obtiene la clave pública de Identity por kid.
export interface IJwks {
  getKey(kid: string): Promise<KeyObject>;
}

export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface Jwk {
  kid?: string;
  kty?: string;
  [k: string]: unknown;
}

// Cliente HTTP de JWKS con caché en memoria: TTL + refresco ante kid desconocido (rotación de claves).
// minRefreshMs limita la frecuencia de consultas a Identity (evita martillarlo ante tokens con kid falso).
export class JwksClient implements IJwks {
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;
  private lastAttempt = 0;
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly url: string,
    private readonly ttlMs: number,
    private readonly fetchFn: FetchFn = (u) => fetch(u, { signal: AbortSignal.timeout(5000) }),
    private readonly minRefreshMs = 5000,
  ) {}

  async getKey(kid: string): Promise<KeyObject> {
    const now = Date.now();
    const expired = now - this.fetchedAt >= this.ttlMs;
    if ((expired || !this.keys.has(kid)) && now - this.lastAttempt >= this.minRefreshMs) {
      try {
        await this.refresh();
      } catch (e) {
        logger.warn('No se pudo refrescar JWKS', { url: this.url, reason: (e as Error).message });
        if (!this.keys.has(kid)) throw new ServiceUnavailableError('Servicio de identidad no disponible');
        // Con una clave ya cacheada se sigue verificando (degradación suave).
      }
    }
    const key = this.keys.get(kid);
    if (!key) throw new UnauthorizedError('Token invalido: kid desconocido');
    return key;
  }

  private refresh(): Promise<void> {
    this.inflight ??= this.doRefresh().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async doRefresh(): Promise<void> {
    this.lastAttempt = Date.now();
    const res = await this.fetchFn(this.url);
    if (!res.ok) throw new Error(`JWKS respondió ${res.status}`);
    const body = (await res.json()) as { keys?: Jwk[] };
    const next = new Map<string, KeyObject>();
    for (const jwk of body.keys ?? []) {
      if (jwk.kty !== 'RSA' || !jwk.kid) continue;
      next.set(jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' }));
    }
    this.keys = next;
    this.fetchedAt = Date.now();
  }
}
