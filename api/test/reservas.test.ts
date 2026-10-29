import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { bearer, buildWorld } from './helpers';

let w: ReturnType<typeof buildWorld>;
let c1: Awaited<ReturnType<typeof w.mkCliente>>;
let c2: Awaited<ReturnType<typeof w.mkCliente>>;

beforeEach(async () => {
  w = buildWorld();
  c1 = await w.mkCliente(1);
  c2 = await w.mkCliente(2);
});

const reservar = (token: string, vehiculoId: string, inicio: string, fin: string) =>
  request(w.app).post('/api/reservas').set(bearer(token)).send({ vehiculoId, inicio, fin });

const T = (h: number) => `2026-11-10T${String(h).padStart(2, '0')}:00:00Z`;

describe('Solapamiento (service-level)', () => {
  it('reserva solapada del mismo vehículo -> 409 con mensaje', async () => {
    expect((await reservar(c1.token, c1.vehiculo.id, T(9), T(12))).status).toBe(201);
    const res = await reservar(c1.token, c1.vehiculo.id, T(11), T(13));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('El vehículo ya tiene una reserva activa en ese horario');
  });

  it.each([
    ['contenida', T(10), T(11), 409],
    ['idéntica', T(9), T(12), 409],
    ['que contiene', T(8), T(13), 409],
    ['parcial por la izquierda', T(8), T(10), 409],
    ['adyacente posterior [b,c)', T(12), T(14), 201],
    ['adyacente anterior', T(7), T(9), 201],
  ])('%s', async (_n, ini, fin, status) => {
    await reservar(c1.token, c1.vehiculo.id, T(9), T(12));
    expect((await reservar(c1.token, c1.vehiculo.id, ini, fin)).status).toBe(status);
  });

  it('otro vehículo en la misma franja no choca', async () => {
    const v2 = await w.vehiculos.create({ matricula: 'SAB 9999', clienteId: c1.cliente.id });
    await reservar(c1.token, c1.vehiculo.id, T(9), T(12));
    expect((await reservar(c1.token, v2.id, T(9), T(12))).status).toBe(201);
  });

  it('una reserva cancelada libera el horario', async () => {
    const r = await reservar(c1.token, c1.vehiculo.id, T(9), T(12));
    expect((await reservar(c1.token, c1.vehiculo.id, T(9), T(12))).status).toBe(409);
    const c = await request(w.app).post(`/api/reservas/${r.body.id}/cancelar`).set(bearer(c1.token));
    expect(c.status).toBe(200);
    expect(c.body.estado).toBe('CANCELADA');
    expect((await reservar(c1.token, c1.vehiculo.id, T(9), T(12))).status).toBe(201);
  });

  it('fin <= inicio -> 400', async () => {
    expect((await reservar(c1.token, c1.vehiculo.id, T(12), T(9))).status).toBe(400);
    expect((await reservar(c1.token, c1.vehiculo.id, T(12), T(12))).status).toBe(400);
  });

  it('PUT revalida solapamiento ignorando la propia reserva', async () => {
    const a = await reservar(c1.token, c1.vehiculo.id, T(9), T(12));
    await reservar(c1.token, c1.vehiculo.id, T(14), T(16));
    const put = (id: string, ini: string, fin: string) =>
      request(w.app).put(`/api/reservas/${id}`).set(bearer(c1.token)).send({ inicio: ini, fin });
    expect((await put(a.body.id, T(10), T(13))).status).toBe(200); // se solapa solo consigo misma
    expect((await put(a.body.id, T(13), T(15))).status).toBe(409);
  });

  it('si el service no detecta la carrera, la constraint (23P01 simulado) también da 409', async () => {
    // Simula la carrera: ambos chequeos pasan, la BD rechaza el segundo insert.
    const real = w.reservas.existsOverlap.bind(w.reservas);
    w.reservas.existsOverlap = async () => false;
    await reservar(c1.token, c1.vehiculo.id, T(9), T(12));
    const res = await reservar(c1.token, c1.vehiculo.id, T(10), T(11));
    w.reservas.existsOverlap = real;
    expect(res.status).toBe(409);
  });
});

describe('Pertenencia (OwnershipResolver)', () => {
  it('CLIENTE no puede reservar con el vehículo de otro -> 404 y no se crea nada', async () => {
    const res = await reservar(c1.token, c2.vehiculo.id, T(9), T(12));
    expect(res.status).toBe(404);
    expect(w.reservas.rows).toHaveLength(0);
  });

  it('CLIENTE no puede leer / modificar / cancelar la reserva de otro', async () => {
    const r = await reservar(c2.token, c2.vehiculo.id, T(9), T(12));
    const id = r.body.id;
    expect((await request(w.app).get(`/api/reservas/${id}`).set(bearer(c1.token))).status).toBe(404);
    expect((await request(w.app).put(`/api/reservas/${id}`).set(bearer(c1.token)).send({ inicio: T(10), fin: T(11) })).status).toBe(404);
    expect((await request(w.app).post(`/api/reservas/${id}/cancelar`).set(bearer(c1.token))).status).toBe(404);
    expect((await request(w.app).get(`/api/reservas/${id}`).set(bearer(c2.token))).status).toBe(200);
    expect((await request(w.app).get(`/api/reservas/${id}`).set(bearer(w.adminToken))).status).toBe(200);
  });

  it('ADMIN puede reservar sobre cualquier vehículo; la reserva queda a nombre del dueño', async () => {
    const res = await reservar(w.adminToken, c2.vehiculo.id, T(9), T(12));
    expect(res.status).toBe(201);
    expect(res.body.clienteId).toBe(c2.cliente.id);
  });

  it('GET /reservas/mias ignora clienteId (query y body): solo devuelve las del token', async () => {
    await reservar(c1.token, c1.vehiculo.id, T(9), T(10));
    await reservar(c2.token, c2.vehiculo.id, T(9), T(10));
    const res = await request(w.app)
      .get(`/api/reservas/mias?clienteId=${c2.cliente.id}`)
      .set(bearer(c1.token))
      .send({ clienteId: c2.cliente.id });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].clienteId).toBe(c1.cliente.id);
  });

  it('/reservas/mias: ADMIN -> 403, sin token -> 401', async () => {
    expect((await request(w.app).get('/api/reservas/mias').set(bearer(w.adminToken))).status).toBe(403);
    expect((await request(w.app).get('/api/reservas/mias')).status).toBe(401);
  });
});

describe('GET /api/admin/reservas (RF5)', () => {
  it('CLIENTE -> 403; ADMIN filtra por cliente, estado y rango, con paginación', async () => {
    const a = await reservar(c1.token, c1.vehiculo.id, T(9), T(10));
    await reservar(c1.token, c1.vehiculo.id, T(11), T(12));
    await reservar(c2.token, c2.vehiculo.id, T(9), T(10));
    await request(w.app).post(`/api/reservas/${a.body.id}/cancelar`).set(bearer(c1.token));

    expect((await request(w.app).get('/api/admin/reservas').set(bearer(c1.token))).status).toBe(403);
    const get = (q: string) => request(w.app).get(`/api/admin/reservas${q}`).set(bearer(w.adminToken));

    expect((await get('')).body.total).toBe(3);
    expect((await get(`?clienteId=${c1.cliente.id}`)).body.total).toBe(2);
    expect((await get('?estado=CANCELADA')).body.total).toBe(1);
    expect((await get(`?desde=${encodeURIComponent(T(11))}`)).body.total).toBe(1);
    const p = await get('?page=2&pageSize=2');
    expect(p.body.items).toHaveLength(1);
    expect(p.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect((await get('?estado=XX')).status).toBe(400);
    expect((await get('?clienteId=no-uuid')).status).toBe(400);
  });
});

describe('Vehículos (RF2) y auditoría', () => {
  it('CLIENTE crea vehículo propio: el clienteId del body se ignora; matrícula se normaliza', async () => {
    const res = await request(w.app).post('/api/vehiculos').set(bearer(c1.token))
      .send({ matricula: ' sbb  1111 ', marca: 'Toyota', clienteId: c2.cliente.id });
    expect(res.status).toBe(201);
    expect(res.body.clienteId).toBe(c1.cliente.id);
    expect(res.body.matricula).toBe('SBB 1111');
  });

  it('ADMIN debe indicar clienteId (400 si falta)', async () => {
    const miss = await request(w.app).post('/api/vehiculos').set(bearer(w.adminToken)).send({ matricula: 'SBB 2222' });
    expect(miss.status).toBe(400);
    const ok = await request(w.app).post('/api/vehiculos').set(bearer(w.adminToken)).send({ matricula: 'SBB 2222', clienteId: c2.cliente.id });
    expect(ok.status).toBe(201);
  });

  it('vehículo ajeno -> 404; listado solo propios; borrar con ACTIVA -> 409', async () => {
    expect((await request(w.app).get(`/api/vehiculos/${c2.vehiculo.id}`).set(bearer(c1.token))).status).toBe(404);
    expect((await request(w.app).delete(`/api/vehiculos/${c2.vehiculo.id}`).set(bearer(c1.token))).status).toBe(404);
    const list = await request(w.app).get('/api/vehiculos').set(bearer(c1.token));
    expect(list.body.map((v: { id: string }) => v.id)).toEqual([c1.vehiculo.id]);

    await reservar(c1.token, c1.vehiculo.id, T(9), T(10));
    expect((await request(w.app).delete(`/api/vehiculos/${c1.vehiculo.id}`).set(bearer(c1.token))).status).toBe(409);
  });

  it('cada escritura publica un evento con userId = sub y tipo correcto', async () => {
    const r = await reservar(c1.token, c1.vehiculo.id, T(9), T(10));
    await request(w.app).put(`/api/reservas/${r.body.id}`).set(bearer(c1.token)).send({ inicio: T(9), fin: T(11) });
    await request(w.app).post(`/api/reservas/${r.body.id}/cancelar`).set(bearer(c1.token));
    await request(w.app).post(`/api/reservas/${r.body.id}/cancelar`).set(bearer(c1.token)); // idempotente: sin evento
    const evs = w.audit.events.filter((e) => e.entidad === 'Reserva');
    expect(evs.map((e) => e.tipo)).toEqual(['CREAR', 'MODIFICAR', 'CANCELAR']);
    expect(evs.every((e) => e.userId === 'user-1' && e.entidadId === r.body.id)).toBe(true);
  });

  it('una falla del publicador no rompe la respuesta (post-commit, fire-and-forget)', async () => {
    w.audit.publicar = async () => { throw new Error('boom'); };
    expect((await reservar(c1.token, c1.vehiculo.id, T(9), T(10))).status).toBe(201);
  });

  it('un evento no se publica cuando la operación falla', async () => {
    await reservar(c1.token, c1.vehiculo.id, T(9), T(10));
    const antes = w.audit.events.length;
    await reservar(c1.token, c1.vehiculo.id, T(9), T(10)); // 409
    expect(w.audit.events).toHaveLength(antes);
  });
});
