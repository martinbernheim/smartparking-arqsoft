import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireRole } from '../auth/authorization.guard';
import type { ReservasController } from './reservas.controller';

export const reservasRoutes = (c: ReservasController, actor: RequestHandler) => {
  const r = Router();
  r.use(requireRole('ADMIN', 'CLIENTE'), actor);
  r.get('/mias', requireRole('CLIENTE'), c.mias); // RF4 (antes de /:id)
  r.post('/', c.crear);
  r.get('/:id', c.obtener);
  r.put('/:id', c.modificar);
  r.post('/:id/cancelar', c.cancelar);
  return r;
};

// RF5: GET /api/admin/reservas
export const adminReservasRoutes = (c: ReservasController, actor: RequestHandler) => {
  const r = Router();
  r.use(requireRole('ADMIN'), actor);
  r.get('/reservas', c.admin);
  return r;
};
