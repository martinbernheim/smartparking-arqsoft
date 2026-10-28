import { z } from 'zod';

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
