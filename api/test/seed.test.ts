import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { EventoAuditoriaDTO } from '@smartparking/contracts';
import { seed } from '../src/seed/seed';

const env = { SEED_CLIENT1_ID: 'u1', SEED_CLIENT2_ID: 'u2', SEED_CLIENT1_EMAIL: 'a@x.com', SEED_CLIENT2_EMAIL: 'b@x.com' };

function fakePrisma(existing: Set<string>) {
  const model = () => ({
    findUnique: async ({ where }: { where: { id: string } }) => (existing.has(where.id) ? { id: where.id } : null),
    upsert: async () => ({}),
  });
  return { cliente: model(), vehiculo: model(), reserva: model() } as unknown as PrismaClient;
}

describe('seed -> auditoría', () => {
  it('publica CREAR (userId seed) por cada entidad creada', async () => {
    const eventos: EventoAuditoriaDTO[] = [];
    await seed(fakePrisma(new Set()), env, { publicar: async (e) => void eventos.push(e) });
    expect(eventos.filter((e) => e.entidad === 'Cliente')).toHaveLength(2);
    expect(eventos.filter((e) => e.entidad === 'Vehiculo')).toHaveLength(3);
    expect(eventos.filter((e) => e.entidad === 'Reserva')).toHaveLength(5);
    expect(eventos.every((e) => e.tipo === 'CREAR' && e.userId === 'seed')).toBe(true);
    expect(eventos.find((e) => e.entidad === 'Cliente')?.datos).toMatchObject({ nombre: 'María Fernández', identityUserId: 'u1' });
    expect(eventos.find((e) => e.entidadId.endsWith('e3'))?.datos).toMatchObject({ estado: 'CANCELADA' });
  });

  it('no publica nada si las entidades ya existían (idempotencia)', async () => {
    const eventos: EventoAuditoriaDTO[] = [];
    const ids = new Set<string>();
    for (const s of ['c1', 'c2', 'a1', 'a2', 'a3', 'e1', 'e2', 'e3', 'e4', 'e5']) ids.add(`00000000-0000-4000-8000-0000000000${s}`);
    await seed(fakePrisma(ids), env, { publicar: async (e) => void eventos.push(e) });
    expect(eventos).toHaveLength(0);
  });

  it('un fallo del publicador no hace fallar el seed', async () => {
    await expect(seed(fakePrisma(new Set()), env, { publicar: async () => { throw new Error('down'); } })).resolves.toBeUndefined();
  });
});
