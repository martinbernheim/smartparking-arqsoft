import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env';
import { logger } from '../logger';

type SeedEnv = Pick<Env, 'SEED_CLIENT1_EMAIL' | 'SEED_CLIENT1_ID' | 'SEED_CLIENT2_EMAIL' | 'SEED_CLIENT2_ID'>;

// Ids fijos => el seed es idempotente (upsert por clave natural / id) y reproducible.
const d = (s: string) => new Date(s);

// Datos demo (D16). identityUserId = SEED_CLIENTn_ID, los mismos ids que usa Identity para sus usuarios demo.
export async function seed(prisma: PrismaClient, env: SeedEnv): Promise<void> {
  const clientes = [
    {
      id: '00000000-0000-4000-8000-0000000000c1',
      nombre: 'Cliente Uno',
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
      nombre: 'Cliente Dos',
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
    await prisma.cliente.upsert({
      where: { id: c.id },
      update: {},
      create: { id: c.id, nombre: c.nombre, email: c.email, telefono: c.telefono, identityUserId: c.identityUserId },
    });
    for (const v of c.vehiculos) {
      await prisma.vehiculo.upsert({
        where: { id: v.id },
        // update: corrige marca/modelo de vehículos ya sembrados (los volúmenes se conservan)
        update: { matricula: v.matricula, marca: v.marca, modelo: v.modelo },
        create: { ...v, clienteId: c.id },
      });
    }
  }

  for (const r of reservas) {
    const cliente = clientes[r.c];
    if (!cliente.identityUserId) continue;
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
  }
  logger.info('Seed aplicado');
}
