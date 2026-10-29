import { z } from 'zod';

export const EventoAuditoriaDTOSchema = z.object({
  eventId: z.string().uuid(),
  tipo: z.enum(['CREAR', 'MODIFICAR', 'CANCELAR', 'ELIMINAR']),
  entidad: z.string().min(1),
  entidadId: z.string().min(1),
  userId: z.string().min(1),
  fechaHora: z.string().datetime(),
  // Opcional (retrocompatible): snapshot de la entidad tras el cambio. Lo usa el modelo de lectura CQRS.
  // Reserva: {clienteId, vehiculoId, inicio, fin, estado[, identityUserId]}; Vehiculo: {clienteId, matricula, marca, modelo};
  // Cliente: {nombre, email, identityUserId}.
  datos: z.record(z.unknown()).optional(),
});
export type EventoAuditoriaDTO = z.infer<typeof EventoAuditoriaDTOSchema>;
