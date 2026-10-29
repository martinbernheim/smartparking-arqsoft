import { z } from 'zod';

export const ClienteDTOSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1),
  email: z.string().email(),
  telefono: z.string().optional(),
  identityUserId: z.string(),
  createdAt: z.string().datetime().optional(),
});
export type ClienteDTO = z.infer<typeof ClienteDTOSchema>;

// Alta de cliente por ADMIN: la contraseña solo viaja hacia Identity, nunca se persiste en la BD operacional.
export const CrearClienteRequestSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  telefono: z.string().min(1).optional(),
  password: z.string().min(8),
});
export type CrearClienteRequest = z.infer<typeof CrearClienteRequestSchema>;

// El email no se modifica (es el login en Identity).
export const ActualizarClienteRequestSchema = z
  .object({
    nombre: z.string().min(1).optional(),
    telefono: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Sin campos para actualizar');
export type ActualizarClienteRequest = z.infer<typeof ActualizarClienteRequestSchema>;
