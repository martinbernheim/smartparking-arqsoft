import { z } from 'zod';

export const VehiculoDTOSchema = z.object({
  id: z.string().uuid(),
  matricula: z.string().min(1),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  clienteId: z.string().uuid(),
});
export type VehiculoDTO = z.infer<typeof VehiculoDTOSchema>;

// CLIENTE: clienteId se ignora (sale del token). ADMIN: clienteId obligatorio.
export const CrearVehiculoRequestSchema = z.object({
  matricula: z.string().trim().min(1),
  marca: z.string().min(1).optional(),
  modelo: z.string().min(1).optional(),
  clienteId: z.string().uuid().optional(),
});
export type CrearVehiculoRequest = z.infer<typeof CrearVehiculoRequestSchema>;

export const ActualizarVehiculoRequestSchema = z
  .object({
    matricula: z.string().trim().min(1).optional(),
    marca: z.string().min(1).nullable().optional(),
    modelo: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Sin campos para actualizar');
export type ActualizarVehiculoRequest = z.infer<typeof ActualizarVehiculoRequestSchema>;
