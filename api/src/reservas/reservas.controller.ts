import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  ActualizarReservaRequestSchema,
  CrearReservaRequestSchema,
  ReservaFiltroDTOSchema,
  type ReservaDTO,
} from '@smartparking/contracts';
import type { Reserva } from './reserva.repository';
import type { ReservaCommandService } from './reserva-command.service';
import type { ReservaQueryService } from './reserva-query.service';

export const toReservaDTO = (r: Reserva): ReservaDTO => ({
  id: r.id,
  vehiculoId: r.vehiculoId,
  clienteId: r.clienteId,
  inicio: r.inicio.toISOString(),
  fin: r.fin.toISOString(),
  estado: r.estado,
});

const IdParam = z.object({ id: z.string().uuid() });

export class ReservasController {
  constructor(
    private readonly commands: ReservaCommandService,
    private readonly queries: ReservaQueryService,
  ) {}

  crear = async (req: Request, res: Response) => {
    const body = CrearReservaRequestSchema.parse(req.body);
    res.status(201).json(toReservaDTO(await this.commands.crear(req.actor!, body)));
  };

  obtener = async (req: Request, res: Response) => {
    const { id } = IdParam.parse(req.params);
    res.json(toReservaDTO(await this.queries.obtener(req.actor!, id)));
  };

  modificar = async (req: Request, res: Response) => {
    const { id } = IdParam.parse(req.params);
    const body = ActualizarReservaRequestSchema.parse(req.body);
    res.json(toReservaDTO(await this.commands.modificar(req.actor!, id, body)));
  };

  cancelar = async (req: Request, res: Response) => {
    const { id } = IdParam.parse(req.params);
    res.json(toReservaDTO(await this.commands.cancelar(req.actor!, id)));
  };

  // Ignora por completo cualquier clienteId de query/body: el cliente es el del token.
  mias = async (req: Request, res: Response) => {
    const { value, cache } = await this.queries.misReservas(req.actor!);
    res.setHeader('X-Cache', cache);
    res.json(value.map(toReservaDTO));
  };

  admin = async (req: Request, res: Response) => {
    const filtro = ReservaFiltroDTOSchema.parse(req.query);
    const { value: r, cache } = await this.queries.buscar(filtro);
    res.setHeader('X-Cache', cache);
    res.json({ ...r, items: r.items.map(toReservaDTO) });
  };
}
