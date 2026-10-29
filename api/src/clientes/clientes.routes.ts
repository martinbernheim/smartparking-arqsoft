import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireRole } from '../auth/authorization.guard';
import type { ClientesController } from './clientes.controller';

// `actor` = OwnershipResolver.actor() (deja req.actor). Todas las rutas requieren JWT (montado antes).
export const clientesRoutes = (c: ClientesController, actor: RequestHandler) => {
  const r = Router();
  r.get('/me', requireRole('CLIENTE'), c.me);
  r.use(requireRole('ADMIN'), actor); // RF1: solo ADMIN
  r.post('/', c.crear);
  r.get('/', c.listar);
  r.get('/:id', c.obtener);
  r.put('/:id', c.actualizar);
  r.delete('/:id', c.eliminar);
  return r;
};
