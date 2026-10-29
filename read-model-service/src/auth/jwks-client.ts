import { createPublicKey, type KeyObject } from 'node:crypto';
import { logger } from '../logger';

export interface IJwks {
  getKey(kid: string): Promise<KeyObject>;
}

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403 | 503,
    message: string,
  ) {
    super(message);
  }
}

type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

// Mismo mecanismo que la API: JWKS de Identity en caché (TTL + refresco ante kid desconocido).
export class JwksClient implements IJwks {
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;
  private lastAttempt = 0;

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
        if (!this.keys.has(kid)) throw new AuthError(503, 'Servicio de identidad no disponible');
      }
    }
    const key = this.keys.get(kid);
    if (!key) throw new AuthError(401, 'Token invalido: kid desconocido');
    return key;
  }

  private async refresh(): Promise<void> {
    this.lastAttempt = Date.now();
    const res = await this.fetchFn(this.url);
    if (!res.ok) throw new Error(`JWKS respondió ${res.status}`);
    const body = (await res.json()) as { keys?: Array<{ kid?: string; kty?: string }> };
    const next = new Map<string, KeyObject>();
    for (const jwk of body.keys ?? []) {
      if (jwk.kty !== 'RSA' || !jwk.kid) continue;
      next.set(jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' }));
    }
    this.keys = next;
    this.fetchedAt = Date.now();
  }
}
