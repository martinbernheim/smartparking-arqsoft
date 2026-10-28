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

export const ReservaFiltroDTOSchema = z.object({
  clienteId: z.string().uuid().optional(),
  estado: EstadoReservaSchema.optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
});
export type ReservaFiltroDTO = z.infer<typeof ReservaFiltroDTOSchema>;
