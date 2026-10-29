import { z } from 'zod';

export const EstadoReservaSchema = z.enum(['ACTIVA', 'CANCELADA']);
export type EstadoReserva = z.infer<typeof EstadoReservaSchema>;

export const ReservaDTOSchema = z.object({
  id: z.string().uuid(),
  vehiculoId: z.string().uuid(),
  clienteId: z.string().uuid(),
  inicio: z.string().datetime(),
  fin: z.string().datetime(),
  estado: EstadoReservaSchema,
});
export type ReservaDTO = z.infer<typeof ReservaDTOSchema>;

const fecha = z.string().datetime({ offset: true });

// Intervalos semiabiertos [inicio, fin): fin debe ser estrictamente posterior a inicio.
const finPosterior = (v: { inicio: string; fin: string }) => new Date(v.fin) > new Date(v.inicio);

export const CrearReservaRequestSchema = z
  .object({ vehiculoId: z.string().uuid(), inicio: fecha, fin: fecha })
  .refine(finPosterior, { message: 'fin debe ser posterior a inicio', path: ['fin'] });
export type CrearReservaRequest = z.infer<typeof CrearReservaRequestSchema>;

export const ActualizarReservaRequestSchema = z
  .object({ inicio: fecha, fin: fecha })
  .refine(finPosterior, { message: 'fin debe ser posterior a inicio', path: ['fin'] });
export type ActualizarReservaRequest = z.infer<typeof ActualizarReservaRequestSchema>;

export const ReservaFiltroDTOSchema = z.object({
  clienteId: z.string().uuid().optional(),
  estado: EstadoReservaSchema.optional(),
  desde: z.string().datetime({ offset: true }).optional(),
  hasta: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ReservaFiltroDTO = z.infer<typeof ReservaFiltroDTOSchema>;
