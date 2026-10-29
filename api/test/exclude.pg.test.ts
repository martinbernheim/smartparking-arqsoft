import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaReservaRepository } from '../src/reservas/reserva.repository';

// Integración contra Postgres real (migraciones ya aplicadas). Se omite salvo que RUN_DB_TESTS=1 y
// DATABASE_URL apunten a una BD de pruebas:
//   RUN_DB_TESTS=1 DATABASE_URL=postgresql://smartparking:smartparking@localhost:5432/smartparking npm test -w api
const enabled = process.env.RUN_DB_TESTS === '1' && !!process.env.DATABASE_URL;

describe.skipIf(!enabled)('constraint EXCLUDE reserva_sin_solapamiento (Postgres real)', () => {
  let prisma: PrismaClient;
  let repo: PrismaReservaRepository;
  const tag = `T${Date.now()}`;
  let clienteId: string;
  let vehiculoId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    repo = new PrismaReservaRepository({ primary: prisma, replica: prisma });
    const c = await prisma.cliente.create({ data: { nombre: tag, email: `${tag}@t.local`, identityUserId: tag } });
    clienteId = c.id;
    vehiculoId = (await prisma.vehiculo.create({ data: { matricula: tag, clienteId } })).id;
  });

  afterAll(async () => {
    await prisma.reserva.deleteMany({ where: { clienteId } });
    await prisma.vehiculo.deleteMany({ where: { clienteId } });
    await prisma.cliente.deleteMany({ where: { id: clienteId } });
    await prisma.$disconnect();
  });

  const d = (h: number) => new Date(`2030-01-01T${String(h).padStart(2, '0')}:00:00Z`);

  it('dos inserts concurrentes solapados -> exactamente uno OK y otro 409', async () => {
    const attempts = await Promise.allSettled([
      repo.create({ clienteId, vehiculoId, inicio: d(9), fin: d(12) }),
      repo.create({ clienteId, vehiculoId, inicio: d(10), fin: d(13) }),
    ]);
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    const rejected = attempts.find((a) => a.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
  });

  it('reserva adyacente permitida y cancelada no bloquea', async () => {
    // La ganadora de la carrera anterior ocupa [9,12) o [10,13): se usa un tramo posterior para el adyacente.
    const ganadora = await prisma.reserva.findFirstOrThrow({ where: { vehiculoId, estado: 'ACTIVA' } });
    await expect(repo.create({ clienteId, vehiculoId, inicio: ganadora.fin, fin: d(15) })).resolves.toBeTruthy();
    await repo.update(ganadora.id, { estado: 'CANCELADA' });
    await expect(repo.create({ clienteId, vehiculoId, inicio: ganadora.inicio, fin: ganadora.fin })).resolves.toBeTruthy();
  });
});
