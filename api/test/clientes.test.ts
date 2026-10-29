import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { bearer, buildWorld, signToken } from './helpers';

let w: ReturnType<typeof buildWorld>;
beforeEach(() => { w = buildWorld(); });

describe('Clientes (RF1)', () => {
  it('sin token 401; CLIENTE 403; ADMIN 200', async () => {
    const c1 = await w.mkCliente(1);
    expect((await request(w.app).get('/api/clientes')).status).toBe(401);
    expect((await request(w.app).get('/api/clientes').set(bearer(c1.token))).status).toBe(403);
    expect((await request(w.app).get('/api/clientes').set(bearer(w.adminToken))).status).toBe(200);
  });

  it('POST crea usuario en Identity (rol CLIENTE, reenviando el JWT del ADMIN), persiste Cliente y audita', async () => {
    const res = await request(w.app)
      .post('/api/clientes')
      .set(bearer(w.adminToken))
      .send({ nombre: 'Nuevo', email: 'Nuevo@T.local', password: 'Secreta123!' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('nuevo@t.local');
    expect(res.body.identityUserId).toBe('idn-1');
    expect(res.body).not.toHaveProperty('password');
    expect(w.userAdmin.calls).toEqual([{ token: w.adminToken, email: 'nuevo@t.local', rol: 'CLIENTE' }]);
    expect(w.audit.events).toHaveLength(1);
    expect(w.audit.events[0]).toMatchObject({ tipo: 'CREAR', entidad: 'Cliente', userId: 'admin-1', entidadId: res.body.id });
  });

  it('email duplicado -> 409 sin crear otro usuario en Identity; validación -> 400', async () => {
    await w.mkCliente(1);
    const dup = await request(w.app).post('/api/clientes').set(bearer(w.adminToken))
      .send({ nombre: 'X', email: 'c1@t.local', password: 'Secreta123!' });
    expect(dup.status).toBe(409);
    expect(w.userAdmin.calls).toHaveLength(0);
    const bad = await request(w.app).post('/api/clientes').set(bearer(w.adminToken)).send({ nombre: 'X', email: 'no', password: '1' });
    expect(bad.status).toBe(400);
  });

  it('DELETE con reservas ACTIVAS -> 409; sin ellas -> 204 y auditoría ELIMINAR', async () => {
    const c1 = await w.mkCliente(1);
    const r = await w.reservas.create({ clienteId: c1.cliente.id, vehiculoId: c1.vehiculo.id, inicio: new Date('2026-11-01T10:00:00Z'), fin: new Date('2026-11-01T11:00:00Z') });
    const del = await request(w.app).delete(`/api/clientes/${c1.cliente.id}`).set(bearer(w.adminToken));
    expect(del.status).toBe(409);
    await w.reservas.update(r.id, { estado: 'CANCELADA' });
    const ok = await request(w.app).delete(`/api/clientes/${c1.cliente.id}`).set(bearer(w.adminToken));
    expect(ok.status).toBe(204);
    expect(w.audit.events.at(-1)).toMatchObject({ tipo: 'ELIMINAR', entidad: 'Cliente' });
  });

  it('GET /clientes/me devuelve el perfil propio; ADMIN -> 403; CLIENTE sin Cliente asociado -> 403', async () => {
    const c1 = await w.mkCliente(1);
    await w.mkCliente(2);
    const me = await request(w.app).get('/api/clientes/me').set(bearer(c1.token));
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(c1.cliente.id);
    expect((await request(w.app).get('/api/clientes/me').set(bearer(w.adminToken))).status).toBe(403);
    const huerfano = signToken('sin-cliente', ['CLIENTE']);
    expect((await request(w.app).get('/api/clientes/me').set(bearer(huerfano))).status).toBe(403);
  });
});
