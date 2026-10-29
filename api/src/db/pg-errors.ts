// Detección de errores de Postgres/Prisma sin acoplarse a las clases de Prisma (facilita los mocks).
const code = (e: unknown): string | undefined => (e as { code?: string })?.code;
const text = (e: unknown): string => String((e as { message?: string })?.message ?? '');

export const isUniqueViolation = (e: unknown) => code(e) === 'P2002';
export const isForeignKeyViolation = (e: unknown) => code(e) === 'P2003';
export const isNotFound = (e: unknown) => code(e) === 'P2025';

// exclusion_violation de Postgres (SQLSTATE 23P01): constraint reserva_sin_solapamiento.
export function isExclusionViolation(e: unknown): boolean {
  const meta = (e as { meta?: { code?: string } })?.meta;
  return meta?.code === '23P01' || text(e).includes('23P01') || text(e).includes('reserva_sin_solapamiento');
}

export function uniqueTarget(e: unknown): string {
  const t = (e as { meta?: { target?: unknown } })?.meta?.target;
  return Array.isArray(t) ? t.join(',') : String(t ?? '');
}
