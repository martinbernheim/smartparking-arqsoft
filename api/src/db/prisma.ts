import { PrismaClient } from '@prisma/client';

// Escrituras (y lecturas que deben ver su propia escritura) -> primaria; listados -> réplica.
export interface Db {
  primary: PrismaClient;
  replica: PrismaClient;
}

export function createDb(primaryUrl: string, replicaUrl: string): Db {
  const primary = new PrismaClient({ datasourceUrl: primaryUrl });
  const replica = replicaUrl === primaryUrl ? primary : new PrismaClient({ datasourceUrl: replicaUrl });
  return { primary, replica };
}

export async function closeDb(db: Db): Promise<void> {
  await db.primary.$disconnect();
  if (db.replica !== db.primary) await db.replica.$disconnect();
}
