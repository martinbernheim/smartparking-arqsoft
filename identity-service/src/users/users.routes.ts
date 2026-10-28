import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { UserAdminController } from './user-admin.controller';

export const usersRoutes = (c: UserAdminController, adminGuard: RequestHandler) => {
  const r = Router();
  r.post('/users', adminGuard, c.create); // IUserAdmin
  return r;
};
