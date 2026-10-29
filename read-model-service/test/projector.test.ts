import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { Projector } from '../src/projection/projector';
import { MemoryStore } from './memory-store';

const NOW = new Date('2026-06-01T00:00:00.000Z');
const C1 = 'cli-1';

const reservaEv = (
  tipo: 'CREAR' | 'MODIFICAR' | 'CANCELAR',
  id: string,
  fechaHora: string,
  over: Record<string, unknown> = {},
  eventId = randomUUID(),
) => ({
  eventId,
  tipo,
  entidad: 'Reserva',
  entidadId: id,
  userId: 'u1',
  fechaHora,
  datos: {
    clienteId: C1,
    vehiculoId: 'veh-1',
    inicio: '2026-06-10T10:00:00.000Z',
    fin: '2026-06-10T13:00:00.000Z',
    estado: tipo === 'CANCELAR' ? 'CANCELADA' : 'ACTIVA',
    ...over,
  },
});

describe('Projector', () => {
  let store: MemoryStore;
  let p: Projector;
  beforeEach(() => {
    store = new MemoryStore();
    p = new Projector(store, () => NOW);
  });

  it('reserva creada -> activas +1, horas y próxima reserva', async () => {
    await p.apply(reservaEv('CREAR', 'r1', '2026-05-01T10:00:00.000Z'));
    const r = await store.getResumen(C1);
    expect(r).toMatchObject({ reservasActivas: 1, reservasCanceladas: 0, totalHorasReservadas: 3 });
    expect(r?.proximaReserva?.reservaId).toBe('r1');
  });

  it('reserva cancelada -> activas -1, canceladas +1', async () => {
    await p.apply(reservaEv('CREAR', 'r1', '2026-05-01T10:00:00.000Z'));
    await p.apply(reservaEv('CREAR', 'r2', '2026-05-01T10:01:00.000Z'));
    await p.apply(reservaEv('CANCELAR', 'r1', '2026-05-01T11:00:00.000Z'));
    const r = await store.getResumen(C1);
    expect(r).toMatchObject({ reservasActivas: 1, reservasCanceladas: 1, totalHorasReservadas: 3 });
  });

  it('eventId duplicado se ignora', async () => {
    const ev = reservaEv('CREAR', 'r1', '2026-05-01T10:00:00.000Z');
    expect(await p.apply(ev)).toBe('aplicado');
    expect(await p.apply(ev)).toBe('duplicado');
    expect((await store.getResumen(C1))?.reservasActivas).toBe(1);
  });

  it('desordenado: la cancelación llega antes que la creación', async () => {
    await p.apply(reservaEv('CANCELAR', 'r1', '2026-05-01T11:00:00.000Z'));
    await p.apply(reservaEv('CREAR', 'r1', '2026-05-01T10:00:00.000Z')); // más vieja: no pisa
    expect(await store.getResumen(C1)).toMatchObject({ reservasActivas: 0, reservasCanceladas: 1 });
  });

  it('modificar actualiza horas', async () => {
    await p.apply(reservaEv('CREAR', 'r1', '2026-05-01T10:00:00.000Z'));
    await p.apply(reservaEv('MODIFICAR', 'r1', '2026-05-01T12:00:00.000Z', { fin: '2026-06-10T11:00:00.000Z' }));
    expect((await store.getResumen(C1))?.totalHorasReservadas).toBe(1);
  });

  it('vehículo y cliente completan el resumen; identityUserId desde reserva del propio cliente', async () => {
    await p.apply({
      eventId: randomUUID(), tipo: 'CREAR', entidad: 'Cliente', entidadId: C1, userId: 'adm',
      fechaHora: '2026-05-01T09:00:00.000Z', datos: { nombre: 'Ana', email: 'ana@x.com', identityUserId: 'idn-1' },
    });
    await p.apply({
      eventId: randomUUID(), tipo: 'CREAR', entidad: 'Vehiculo', entidadId: 'veh-1', userId: 'idn-1',
      fechaHora: '2026-05-01T09:30:00.000Z', datos: { clienteId: C1, matricula: 'SBA 0001', marca: 'Fiat', modelo: null },
    });
    const r = await store.getResumen(C1);
    expect(r).toMatchObject({ nombre: 'Ana', identityUserId: 'idn-1' });
    expect(r?.vehiculos).toEqual([{ vehiculoId: 'veh-1', matricula: 'SBA 0001', marca: 'Fiat', modelo: null }]);

    await p.apply(reservaEv('CREAR', 'r9', '2026-05-02T10:00:00.000Z', { identityUserId: 'idn-9' }));
    expect((await store.getResumen(C1))?.identityUserId).toBe('idn-9');
  });

  it('eliminar vehículo borra sus reservas; eliminar cliente purga todo', async () => {
    await p.apply(reservaEv('CREAR', 'r1', '2026-05-01T10:00:00.000Z'));
    await p.apply(reservaEv('CANCELAR', 'r1', '2026-05-01T10:30:00.000Z'));
    await p.apply({
      eventId: randomUUID(), tipo: 'ELIMINAR', entidad: 'Vehiculo', entidadId: 'veh-1', userId: 'u',
      fechaHora: '2026-05-02T00:00:00.000Z', datos: { clienteId: C1 },
    });
    expect(await store.getResumen(C1)).toMatchObject({ reservasActivas: 0, reservasCanceladas: 0 });
    await p.apply({
      eventId: randomUUID(), tipo: 'ELIMINAR', entidad: 'Cliente', entidadId: C1, userId: 'u',
      fechaHora: '2026-05-03T00:00:00.000Z',
    });
    expect(await store.getResumen(C1)).toBeNull();
  });

  it('evento sin datos (legado) se acepta e ignora', async () => {
    const ev = { ...reservaEv('CREAR', 'r1', '2026-05-01T10:00:00.000Z'), datos: undefined };
    expect(await p.apply(ev)).toBe('ignorado');
    expect(await store.getResumen(C1)).toBeNull();
  });
});
