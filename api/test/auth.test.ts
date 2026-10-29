import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { requireRole } from '../src/auth/authorization.guard';
import { JwksClient } from '../src/auth/jwks-client';
import { jwtAuth } from '../src/auth/jwt-auth.middleware';
import { OwnershipResolver } from '../src/auth/ownership.resolver';
import { errorHandler } from '../src/shared/error-handler';
import { ForbiddenError } from '../src/shared/errors';
import { ISSUER, KID, keys, otherKeys, signToken, staticJwks, bearer } from './helpers';

function protectedApp(jwks = staticJwks()) {
  const app = express();
  app.get('/p', jwtAuth(jwks, ISSUER), (req, res) => res.json(req.user));
  app.get('/admin', jwtAuth(jwks, ISSUER), requireRole('ADMIN'), (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('JwtAuthMiddleware', () => {
  it('token válido -> req.user {sub, roles}', async () => {
    const res = await request(protectedApp()).get('/p').set(bearer(signToken('u1', ['CLIENTE'])));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sub: 'u1', roles: ['CLIENTE'] });
  });

  it('sin header -> 401', async () => {
    expect((await request(protectedApp()).get('/p')).status).toBe(401);
  });

  it('token expirado -> 401', async () => {
    const t = signToken('u1', ['CLIENTE'], { expiresIn: -10 });
    expect((await request(protectedApp()).get('/p').set(bearer(t))).status).toBe(401);
  });

  it('firma inválida (otra clave privada) -> 401', async () => {
    const t = signToken('u1', ['ADMIN'], { privateKey: otherKeys.privateKey });
    expect((await request(protectedApp()).get('/p').set(bearer(t))).status).toBe(401);
  });

  it('issuer erróneo -> 401', async () => {
    const t = signToken('u1', ['CLIENTE'], { issuer: 'otro' });
    expect((await request(protectedApp()).get('/p').set(bearer(t))).status).toBe(401);
  });

  it('basura / alg none -> 401', async () => {
    const app = protectedApp();
    expect((await request(app).get('/p').set(bearer('abc.def.ghi'))).status).toBe(401);
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', kid: KID })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'x', roles: ['ADMIN'] })).toString('base64url')}.`;
    expect((await request(app).get('/p').set(bearer(none))).status).toBe(401);
  });
});

describe('AuthorizationGuard', () => {
  it('CLIENTE sobre ruta ADMIN -> 403; ADMIN -> 200', async () => {
    const app = protectedApp();
    expect((await request(app).get('/admin').set(bearer(signToken('u', ['CLIENTE'])))).status).toBe(403);
    expect((await request(app).get('/admin').set(bearer(signToken('a', ['ADMIN'])))).status).toBe(200);
  });
});

describe('OwnershipResolver', () => {
  const lookup = { findClienteIdByIdentityUserId: async (s: string) => (s === 'known' ? 'cli-1' : null) };

  it('sub conocido -> clienteId', async () => {
    expect(await new OwnershipResolver(lookup).resolveClienteId('known')).toBe('cli-1');
  });

  it('sub sin Cliente asociado -> 403', async () => {
    await expect(new OwnershipResolver(lookup).resolveClienteId('nadie')).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('JwksClient', () => {
  const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
  const okFetch = () => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ keys: [jwk] }) }));

  it('cachea la clave: una sola consulta a Identity dentro del TTL', async () => {
    const f = okFetch();
    const c = new JwksClient('http://x', 60_000, f, 0);
    await c.getKey(KID);
    await c.getKey(KID);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('refresca al vencer el TTL', async () => {
    const f = okFetch();
    const c = new JwksClient('http://x', 0, f, 0);
    await c.getKey(KID);
    await c.getKey(KID);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('kid desconocido -> refresca una vez y responde 401 (UnauthorizedError)', async () => {
    const f = okFetch();
    const c = new JwksClient('http://x', 60_000, f, 0);
    await expect(c.getKey('otro')).rejects.toMatchObject({ status: 401 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('Identity caído y sin clave cacheada -> 503; con clave cacheada sigue verificando', async () => {
    const bad = vi.fn(async () => { throw new Error('down'); });
    await expect(new JwksClient('http://x', 60_000, bad, 0).getKey(KID)).rejects.toMatchObject({ status: 503 });

    let up = true;
    const flaky = vi.fn(async () => {
      if (!up) throw new Error('down');
      return { ok: true, status: 200, json: async () => ({ keys: [jwk] }) };
    });
    const c = new JwksClient('http://x', 0, flaky, 0);
    await c.getKey(KID);
    up = false;
    await expect(c.getKey(KID)).resolves.toBeTruthy();
  });
});
