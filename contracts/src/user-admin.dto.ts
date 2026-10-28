import { z } from 'zod';
import { RolSchema } from './common';

export const CrearUsuarioRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  rol: RolSchema,
});
export type CrearUsuarioRequest = z.infer<typeof CrearUsuarioRequestSchema>;

export const CrearUsuarioResponseSchema = z.object({
  identityUserId: z.string(),
});
export type CrearUsuarioResponse = z.infer<typeof CrearUsuarioResponseSchema>;
