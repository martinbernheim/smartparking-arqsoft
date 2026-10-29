import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { CacheService, hashFiltro, miasKey, ADMIN_VER_KEY } from '../src/cache/cache.service';
import { bearer, buildWorld, FakeRedis } from './helpers';

describe('CacheService', () => {
  it('guarda JSON con TTL y lo devuelve', async () => {
    const redis = new FakeRedis();
    const c = new CacheService(redis, 30);
    await c.setJson('k', { a: 1 });
    expect(await c.getJson('k')).toEqual({ a: 1 });
    expect(redis.ttls.get('k')).toBe(30);
  });

  it('hash de filtros estable ante el orden de claves y valores vacíos', () => {
    const a = hashFiltro({ estado: 'ACTIVA', page: 1, pageSize: 20 });
    const b = hashFiltro({ pageSize: 20, page: 1, estado: 'ACTIVA', desde: undefined });
    expect(a).toBe(b);
    expect(hashFiltro({ estado: 'CANCELADA', page: 1, pageSize: 20 })).not.toBe(a);
  });

  it('invalidar borra mias del cliente e incrementa la versión admin', async () => {
    const redis = new FakeRedis();
    const c = new CacheService(redis, 30);
    const f = { page: 1, pageSize: 20 };
    await c.setJson(miasKey('c1'), [1]);
    const k1 = await c.adminKey(f);
    await c.invalidateReservas('c1');
    expect(await c.getJson(miasKey('c1'))).toBeNull();
    expect(redis.store.get(ADMIN_VER_KEY)).toBe('1');
    expect(await c.adminKey(f)).not.toBe(k1);
  });

  it('degrada con gracia si Redis falla', async () => {
    const redis = new FakeRedis();
    redis.failing = true;
    const c = new CacheService(redis, 30);
    expect(await c.getJson('k')).toBeNull();
    await expect(c.setJson('k', 1)).resolves.toBeUndefined();
    await expect(c.invalidateReservas('c1')).resolves.toBeUndefined();
  });

  it('sin cliente Redis actúa como caché deshabilitada', async () => {
    const c = new CacheService(null);
    await c.setJson('k', 1);
    expect(await c.getJson('k')).toBeNull();
  });
});

describe('Caché en consultas de reservas (X-Cache)', () => {
  let w: ReturnType<typeof buildWorld>;
  let c1: Awaited<ReturnType<typeof w.mkCliente>>;
  let c2: Awaited<ReturnType<typeof w.mkCliente>>;
  beforeEach(async () => {
    w = buildWorld();
    c1 = await w.mkCliente(1);
    c2 = await w.mkCliente(2);
  });
  const mias = (t: string) => request(w.app).get('/api/reservas/mias').set(bearer(t));
  const admin = (qs = '') => request(w.app).get(`/api/admin/reservas${qs}`).set(bearer(w.adminToken));
  const crear = (t: string, vehiculoId: string, h: number) =>
    request(w.app)
      .post('/api/reservas')
      .set(bearer(t))
      .send({ vehiculoId, inicio: `2026-11-10T${String(h).padStart(2, "0")}:00:00Z`, fin: `2026-11-10T${String(h + 1).padStart(2, "0")}:00:00Z` });

  it('mias: MISS, luego HIT con el mismo cuerpo; un comando lo invalida', async () => {
    const r1 = await mias(c1.token);
    expect(r1.headers['x-cache']).toBe('MISS');
    const r2 = await mias(c1.token);
    expect(r2.headers['x-cache']).toBe('HIT');
    expect(r2.body).toEqual(r1.body);

    const creada = await crear(c1.token, c1.vehiculo.id, 10);
    expect(creada.status).toBe(201);
    const r3 = await mias(c1.token);
    expect(r3.headers['x-cache']).toBe('MISS');
    expect(r3.body).toHaveLength(1);
    expect((await mias(c1.token)).headers['x-cache']).toBe('HIT');

    await request(w.app).post(`/api/reservas/${creada.body.id}/cancelar`).set(bearer(c1.token));
    const r4 = await mias(c1.token);
    expect(r4.headers['x-cache']).toBe('MISS');
    expect(r4.body[0].estado).toBe('CANCELADA');
  });

  it('eliminar vehículo/cliente (borra reservas canceladas) invalida la caché', async () => {
    const creada = await crear(c1.token, c1.vehiculo.id, 10);
    await request(w.app).post(`/api/reservas/${creada.body.id}/cancelar`).set(bearer(c1.token));
    await mias(c1.token);
    expect((await mias(c1.token)).headers['x-cache']).toBe('HIT');
    // el mock en memoria no cascada, pero el servicio debe invalidar igual
    const del = await request(w.app).delete(`/api/vehiculos/${c1.vehiculo.id}`).set(bearer(c1.token));
    expect(del.status).toBe(204);
    expect((await mias(c1.token)).headers['x-cache']).toBe('MISS');

    await mias(c2.token);
    await admin();
    expect((await admin()).headers['x-cache']).toBe('HIT');
    await request(w.app).delete(`/api/clientes/${c2.cliente.id}`).set(bearer(w.adminToken));
    expect((await admin()).headers['x-cache']).toBe('MISS');
  });

  it('los eventos de reserva incluyen datos (snapshot) para el modelo de lectura', async () => {
    const creada = await crear(c1.token, c1.vehiculo.id, 10);
    const ev = w.audit.events.find((e) => e.entidadId === creada.body.id)!;
    expect(ev.datos).toMatchObject({ clienteId: c1.cliente.id, vehiculoId: c1.vehiculo.id, estado: 'ACTIVA', identityUserId: 'user-1' });
  });

  it('mias de otro cliente no se invalida ni se mezcla', async () => {
    await mias(c2.token);
    await crear(c1.token, c1.vehiculo.id, 10);
    expect((await mias(c2.token)).headers['x-cache']).toBe('HIT');
    expect((await mias(c2.token)).body).toEqual([]);
  });

  it('admin: HIT para el mismo filtro, MISS tras cualquier comando', async () => {
    expect((await admin('?estado=ACTIVA')).headers['x-cache']).toBe('MISS');
    expect((await admin('?estado=ACTIVA')).headers['x-cache']).toBe('HIT');
    expect((await admin('?estado=CANCELADA')).headers['x-cache']).toBe('MISS');
    await crear(c2.token, c2.vehiculo.id, 12);
    const r = await admin('?estado=ACTIVA');
    expect(r.headers['x-cache']).toBe('MISS');
    expect(r.body.items).toHaveLength(1);
    expect(typeof r.body.items[0].inicio).toBe('string');
  });

  it('con Redis caído responde igual (MISS)', async () => {
    w.redis.failing = true;
    const r = await mias(c1.token);
    expect(r.status).toBe(200);
    expect(r.headers['x-cache']).toBe('MISS');
    expect((await crear(c1.token, c1.vehiculo.id, 9)).status).toBe(201);
  });
});
