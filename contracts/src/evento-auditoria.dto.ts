import { z } from 'zod';

export const EventoAuditoriaDTOSchema = z.object({
  eventId: z.string().uuid(),
  tipo: z.enum(['CREAR', 'MODIFICAR', 'CANCELAR', 'ELIMINAR']),
  entidad: z.string().min(1),
  entidadId: z.string().min(1),
  userId: z.string().min(1),
  fechaHora: z.string().datetime(),
});
export type EventoAuditoriaDTO = z.infer<typeof EventoAuditoriaDTOSchema>;
