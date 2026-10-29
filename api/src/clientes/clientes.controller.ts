import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  ActualizarClienteRequestSchema,
  CrearClienteRequestSchema,
  type ClienteDTO,
} from '@smartparking/contracts';
import type { Cliente } from './cliente.repository';
import type { ClientesService } from './clientes.service';

export const toClienteDTO = (c: Cliente): ClienteDTO => ({
  id: c.id,
  nombre: c.nombre,
  email: c.email,
  ...(c.telefono ? { telefono: c.telefono } : {}),
  identityUserId: c.identityUserId,
  createdAt: c.createdAt.toISOString(),
});

const IdParam = z.object({ id: z.string().uuid() });
export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export class ClientesController {
  constructor(private readonly service: ClientesService) {}

  crear = async (req: Request, res: Response) => {
    const body = CrearClienteRequestSchema.parse(req.body);
    const c = await this.service.crear(req.actor!, req.user!.token, body);
    res.status(201).json(toClienteDTO(c));
  };

  listar = async (req: Request, res: Response) => {
    const { page, pageSize } = PageQuery.parse(req.query);
    const r = await this.service.list(page, pageSize);
    res.json({ ...r, items: r.items.map(toClienteDTO) });
  };

  obtener = async (req: Request, res: Response) => {
    const { id } = IdParam.parse(req.params);
    res.json(toClienteDTO(await this.service.obtener(id)));
  };

  me = async (req: Request, res: Response) => {
    res.json(toClienteDTO(await this.service.miPerfil(req.user!.sub)));
  };

  actualizar = async (req: Request, res: Response) => {
    const { id } = IdParam.parse(req.params);
    const body = ActualizarClienteRequestSchema.parse(req.body);
    res.json(toClienteDTO(await this.service.actualizar(req.actor!, id, body)));
  };

  eliminar = async (req: Request, res: Response) => {
    const { id } = IdParam.parse(req.params);
    await this.service.eliminar(req.actor!, id);
    res.status(204).send();
  };
}
