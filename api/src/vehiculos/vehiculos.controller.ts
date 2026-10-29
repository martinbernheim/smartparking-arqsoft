import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  ActualizarVehiculoRequestSchema,
  CrearVehiculoRequestSchema,
  type VehiculoDTO,
} from '@smartparking/contracts';
import type { Vehiculo } from './vehiculo.repository';
import type { VehiculosService } from './vehiculos.service';

export const toVehiculoDTO = (v: Vehiculo): VehiculoDTO => ({
  id: v.id,
  matricula: v.matricula,
  ...(v.marca ? { marca: v.marca } : {}),
  ...(v.modelo ? { modelo: v.modelo } : {}),
  clienteId: v.clienteId,
});

const IdParam = z.object({ id: z.string().uuid() });
const ListQuery = z.object({ clienteId: z.string().uuid().optional() });

export class VehiculosController {
  constructor(private readonly service: VehiculosService) {}

  crear = async (req: Request, res: Response) => {
    const body = CrearVehiculoRequestSchema.parse(req.body);
    res.status(201).json(toVehiculoDTO(await this.service.crear(req.actor!, body)));
  };

  listar = async (req: Request, res: Response) => {
    const { clienteId } = ListQuery.parse(req.query);
    res.json((await this.service.list(req.actor!, clienteId)).map(toVehiculoDTO));
  };

  obtener = async (req: Request, res: Response) => {
    const { id } = IdParam.parse(req.params);
    res.json(toVehiculoDTO(await this.service.obtener(req.actor!, id)));
  };

  actualizar = async (req: Request, res: Response) => {
    const { id } = IdParam.parse(req.params);
    const body = ActualizarVehiculoRequestSchema.parse(req.body);
    res.json(toVehiculoDTO(await this.service.actualizar(req.actor!, id, body)));
  };

  eliminar = async (req: Request, res: Response) => {
    const { id } = IdParam.parse(req.params);
    await this.service.eliminar(req.actor!, id);
    res.status(204).send();
  };
}
