import express from 'express';
import swaggerUi from 'swagger-ui-express';
import type { IAuditEventPublisher } from './audit/audit-event-publisher';
import type { IJwks } from './auth/jwks-client';
import { jwtAuth } from './auth/jwt-auth.middleware';
import { OwnershipResolver } from './auth/ownership.resolver';
import type { ClienteRepository } from './clientes/cliente.repository';
import { ClientesController } from './clientes/clientes.controller';
import { clientesRoutes } from './clientes/clientes.routes';
import { ClientesService } from './clientes/clientes.service';
import type { Env } from './config/env';
import { openapi } from './docs/openapi';
import type { IUserAdmin } from './identity/user-admin.client';
import type { ReservaRepository } from './reservas/reserva.repository';
import { ReservasController } from './reservas/reservas.controller';
import { adminReservasRoutes, reservasRoutes } from './reservas/reservas.routes';
import { ReservasService } from './reservas/reservas.service';
import { errorHandler, notFoundHandler } from './shared/error-handler';
import type { VehiculoRepository } from './vehiculos/vehiculo.repository';
import { VehiculosController } from './vehiculos/vehiculos.controller';
import { vehiculosRoutes } from './vehiculos/vehiculos.routes';
import { VehiculosService } from './vehiculos/vehiculos.service';

export interface AppDeps {
  env: Pick<Env, 'JWT_ISSUER' | 'INSTANCE_ID'>;
  jwks: IJwks;
  clientes: ClienteRepository;
  vehiculos: VehiculoRepository;
  reservas: ReservaRepository;
  userAdmin: IUserAdmin;
  audit: IAuditEventPublisher; // los módulos CRUD solo conocen el puerto
  isReady?: () => boolean;
}

// Composición de dependencias (inyectables para los tests).
export function createApp({ env, jwks, clientes, vehiculos, reservas, userAdmin, audit, isReady = () => true }: AppDeps) {
  const ownership = new OwnershipResolver(clientes);
  const actor = ownership.actor();
  const auth = jwtAuth(jwks, env.JWT_ISSUER);

  const clientesCtl = new ClientesController(new ClientesService(clientes, userAdmin, audit));
  const vehiculosCtl = new VehiculosController(new VehiculosService(vehiculos, clientes, audit));
  const reservasCtl = new ReservasController(new ReservasService(reservas, vehiculos, audit));

  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Instance', env.INSTANCE_ID);
    next();
  });
  app.use(express.json());

  app.get('/health', (_req, res) => {
    const ok = isReady();
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'unavailable' });
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' })); // accesible vía Nginx bajo /api

  app.get('/api/docs.json', (_req, res) => res.json(openapi));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));

  // Orden: JwtAuthMiddleware -> AuthorizationGuard / OwnershipResolver -> validación (zod) -> controller
  app.use('/api/clientes', auth, clientesRoutes(clientesCtl, actor));
  app.use('/api/vehiculos', auth, vehiculosRoutes(vehiculosCtl, actor));
  app.use('/api/reservas', auth, reservasRoutes(reservasCtl, actor));
  app.use('/api/admin', auth, adminReservasRoutes(reservasCtl, actor));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

