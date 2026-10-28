import { z } from 'zod';

export const VehiculoDTOSchema = z.object({
  id: z.string().uuid(),
  matricula: z.string().min(1),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  clienteId: z.string().uuid(),
});
export type VehiculoDTO = z.infer<typeof VehiculoDTOSchema>;
