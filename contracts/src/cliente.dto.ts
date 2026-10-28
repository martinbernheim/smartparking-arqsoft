import { z } from 'zod';

export const ClienteDTOSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1),
  email: z.string().email(),
  identityUserId: z.string(),
  createdAt: z.string().datetime().optional(),
});
export type ClienteDTO = z.infer<typeof ClienteDTOSchema>;

// Alta de cliente por ADMIN: la contraseña solo viaja hacia Identity, nunca se persiste en la BD operacional.
export const CrearClienteRequestSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});
export type CrearClienteRequest = z.infer<typeof CrearClienteRequestSchema>;
