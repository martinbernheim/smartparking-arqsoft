import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireRole } from '../auth/authorization.guard';
import type { VehiculosController } from './vehiculos.controller';

export const vehiculosRoutes = (c: VehiculosController, actor: RequestHandler) => {
  const r = Router();
  r.use(requireRole('ADMIN', 'CLIENTE'), actor); // RF2
  r.post('/', c.crear);
  r.get('/', c.listar);
  r.get('/:id', c.obtener);
  r.put('/:id', c.actualizar);
  r.delete('/:id', c.eliminar);
  return r;
};
