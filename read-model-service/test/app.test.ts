import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { Projector } from '../src/projection/projector';
import { MemoryStore } from './memory-store';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ISS = 'iss';
const jwks = { getKey: async () => keys.publicKey };
const token = (sub: string, roles: string[]) =>
  jwt.sign({ roles }, keys.privateKey, { algorithm: 'RS256', subject: sub, issuer: ISS, keyid: 'k', expiresIn: 600 });
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('GET /consultas', () => {
  let store: MemoryStore;
  let app: ReturnType<typeof createApp>;
  beforeEach(async () => {
    store = new MemoryStore();
    const projector = new Projector(store);
    await store.mergeCliente('c1', { identityUserId: 'idn-1' });
    await projector.recompute('c1');
    await store.mergeCliente('c2', { identityUserId: 'idn-2' });
    await store.putReserva({ reservaId: 'r', clienteId: 'c2', vehiculoId: 'v', inicio: '2099-01-01T00:00:00.000Z', fin: '2099-01-01T02:00:00.000Z', estado: 'ACTIVA', version: 'a' });
    await projector.recompute('c2');
    app = createApp({ jwks, issuer: ISS, store, projector });
  });

  it('sin token -> 401', async () => {
    expect((await request(app).get('/consultas/ranking')).status).toBe(401);
  });
  it('ADMIN lee cualquier resumen y el ranking ordenado', async () => {
    const t = token('adm', ['ADMIN']);
    expect((await request(app).get('/consultas/clientes/c1/resumen').set(auth(t))).status).toBe(200);
    const r = await request(app).get('/consultas/ranking?limit=1').set(auth(t));
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].clienteId).toBe('c2');
  });
  it('CLIENTE solo su propio resumen (403 en ajeno y en ranking)', async () => {
    const t = token('idn-1', ['CLIENTE']);
    expect((await request(app).get('/consultas/clientes/c1/resumen').set(auth(t))).status).toBe(200);
    expect((await request(app).get('/consultas/clientes/c2/resumen').set(auth(t))).status).toBe(403);
    expect((await request(app).get('/consultas/ranking').set(auth(t))).status).toBe(403);
  });
  it('ADMIN: cliente sin proyección -> 404', async () => {
    expect((await request(app).get('/consultas/clientes/nada/resumen').set(auth(token('a', ['ADMIN'])))).status).toBe(404);
  });
});
