import { z } from 'zod';

export const RolSchema = z.enum(['ADMIN', 'CLIENTE']);
export type Rol = z.infer<typeof RolSchema>;
