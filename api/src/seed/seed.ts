import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env';
import { randomUUID } from 'node:crypto';
import type { IAuditEventPublisher, TipoAuditoria } from '../audit/audit-event-publisher';
import { logger } from '../logger';

type SeedEnv = Pick<Env, 'SEED_CLIENT1_EMAIL' | 'SEED_CLIENT1_ID' | 'SEED_CLIENT2_EMAIL' | 'SEED_CLIENT2_ID'>;

// Ids fijos => el seed es idempotente (upsert por clave natural / id) y reproducible.
const d = (s: string) => new Date(s);

// Datos demo (D16). identityUserId = SEED_CLIENTn_ID, los mismos ids que usa Identity para sus usuarios demo.
// Publica (y espera) un evento de auditoría para que el modelo de lectura CQRS conozca los datos sembrados.
// Solo se llama al CREAR la entidad (idempotencia). Un fallo de entrega nunca hace fallar el seed.
export const SEED_USER_ID = 'seed';

export async function seed(prisma: PrismaClient, env: SeedEnv, audit?: IAuditEventPublisher): Promise<void> {
  const emitir = async (
    tipo: TipoAuditoria,
    entidad: 'Cliente' | 'Vehiculo' | 'Reserva',
    entidadId: string,
    datos: Record<string, unknown>,
  ) => {
    if (!audit) return;
    try {
      await audit.publicar({ eventId: randomUUID(), tipo, entidad, entidadId, userId: SEED_USER_ID, fechaHora: new Date().toISOString(), datos });
    } catch (e) {
      logger.warn('Seed: no se pudo publicar el evento de auditoría', { entidad, entidadId, reason: (e as Error)?.message });
    }
  };

  const clientes = [
    {
      id: '00000000-0000-4000-8000-0000000000c1',
      nombre: 'María Fernández',
      email: env.SEED_CLIENT1_EMAIL ?? 'cliente1@smartparking.local',
      telefono: '099 111 222',
      identityUserId: env.SEED_CLIENT1_ID,
      vehiculos: [
        { id: '00000000-0000-4000-8000-0000000000a1', matricula: 'SBA 1234', marca: 'Volkswagen', modelo: 'Polo' },
        { id: '00000000-0000-4000-8000-0000000000a2', matricula: 'SAB 4321', marca: 'Volkswagen', modelo: 'Gol' },
      ],
    },
    {
      id: '00000000-0000-4000-8000-0000000000c2',
      nombre: 'Santiago Rodríguez',
      email: env.SEED_CLIENT2_EMAIL ?? 'cliente2@smartparking.local',
      telefono: '098 333 444',
      identityUserId: env.SEED_CLIENT2_ID,
      vehiculos: [{ id: '00000000-0000-4000-8000-0000000000a3', matricula: 'SCD 5678', marca: 'Volkswagen', modelo: 'T-Cross' }],
    },
  ];

  const reservas = [
    { id: '00000000-0000-4000-8000-0000000000e1', c: 0, v: 'a1', inicio: '2026-11-10T09:00:00Z', fin: '2026-11-10T12:00:00Z', estado: 'ACTIVA' },
    { id: '00000000-0000-4000-8000-0000000000e2', c: 0, v: 'a1', inicio: '2026-11-12T14:00:00Z', fin: '2026-11-12T18:00:00Z', estado: 'ACTIVA' },
    // Cancelada en la misma franja de e1 (pero otro vehículo): muestra el estado sin afectar disponibilidad.
    { id: '00000000-0000-4000-8000-0000000000e3', c: 0, v: 'a2', inicio: '2026-11-10T09:00:00Z', fin: '2026-11-10T12:00:00Z', estado: 'CANCELADA' },
    { id: '00000000-0000-4000-8000-0000000000e4', c: 1, v: 'a3', inicio: '2026-11-11T08:00:00Z', fin: '2026-11-11T10:00:00Z', estado: 'ACTIVA' },
    { id: '00000000-0000-4000-8000-0000000000e5', c: 1, v: 'a3', inicio: '2026-12-01T10:00:00Z', fin: '2026-12-01T20:00:00Z', estado: 'ACTIVA' },
  ] as const;

  const vehiculoId = (suffix: string) => `00000000-0000-4000-8000-0000000000${suffix}`;

  for (const c of clientes) {
    if (!c.identityUserId) {
      logger.warn('Seed: sin SEED_CLIENTn_ID, se omite el cliente', { email: c.email });
      continue;
    }
    const clienteExistia = Boolean(await prisma.cliente.findUnique({ where: { id: c.id }, select: { id: true } }));
    await prisma.cliente.upsert({
      where: { id: c.id },
      update: {},
      create: { id: c.id, nombre: c.nombre, email: c.email, telefono: c.telefono, identityUserId: c.identityUserId },
    });
    if (!clienteExistia) {
      await emitir('CREAR', 'Cliente', c.id, { nombre: c.nombre, email: c.email, identityUserId: c.identityUserId });
    }
    for (const v of c.vehiculos) {
      const vehiculoExistia = Boolean(await prisma.vehiculo.findUnique({ where: { id: v.id }, select: { id: true } }));
      await prisma.vehiculo.upsert({
        where: { id: v.id },
        // update: corrige marca/modelo de vehículos ya sembrados (los volúmenes se conservan)
        update: { matricula: v.matricula, marca: v.marca, modelo: v.modelo },
        create: { ...v, clienteId: c.id },
      });
      if (!vehiculoExistia) {
        await emitir('CREAR', 'Vehiculo', v.id, { clienteId: c.id, matricula: v.matricula, marca: v.marca, modelo: v.modelo });
      }
    }
  }

  for (const r of reservas) {
    const cliente = clientes[r.c];
    if (!cliente.identityUserId) continue;
    const reservaExistia = Boolean(await prisma.reserva.findUnique({ where: { id: r.id }, select: { id: true } }));
    await prisma.reserva.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        clienteId: cliente.id,
        vehiculoId: vehiculoId(r.v),
        inicio: d(r.inicio),
        fin: d(r.fin),
        estado: r.estado,
      },
    });
    if (!reservaExistia) {
      // El proyector deriva CANCELADA de datos.estado, por lo que basta un CREAR con el estado final.
      await emitir('CREAR', 'Reserva', r.id, {
        clienteId: cliente.id,
        vehiculoId: vehiculoId(r.v),
        inicio: d(r.inicio).toISOString(),
        fin: d(r.fin).toISOString(),
        estado: r.estado,
      });
    }
  }
  logger.info('Seed aplicado');
}
