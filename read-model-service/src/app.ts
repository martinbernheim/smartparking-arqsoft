import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { IJwks } from './auth/jwks-client';
import { AuthError } from './auth/jwks-client';
import { jwtAuth } from './auth/jwt-auth';
import type { Projector } from './projection/projector';
import type { ReadModelStore } from './store/store';

export interface AppDeps {
  jwks: IJwks;
  issuer: string;
  store: ReadModelStore;
  projector: Pick<Projector, 'recompute'>;
  isReady?: () => boolean;
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: 'Error interno' });
};

export const createApp = ({ jwks, issuer, store, projector, isReady = () => true }: AppDeps) => {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    const ok = isReady();
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded' });
  });

  app.use('/consultas', jwtAuth(jwks, issuer));

  // Resumen de un cliente: ADMIN cualquiera; CLIENTE solo el suyo (sub del JWT == identityUserId proyectado).
  app.get('/consultas/clientes/:clienteId/resumen', async (req, res) => {
    const { sub, roles } = req.user!;
    const clienteId = String(req.params.clienteId);
    let resumen = await store.getResumen(clienteId);
    const isAdmin = roles.includes('ADMIN');
    if (!isAdmin && (!roles.includes('CLIENTE') || !resumen?.identityUserId || resumen.identityUserId !== sub)) {
      // 403 tanto si es ajeno como si no existe/no se pudo vincular: no se filtra existencia.
      throw new AuthError(403, 'Acceso denegado');
    }
    if (!resumen) {
      res.status(404).json({ error: 'Sin datos proyectados para ese cliente' });
      return;
    }
    // "proximaReserva" depende del reloj: si la guardada ya pasó, se recalcula desde el estado proyectado.
    if (resumen.proximaReserva && Date.parse(resumen.proximaReserva.inicio) < Date.now()) {
      resumen = await projector.recompute(clienteId);
    }
    res.json(resumen);
  });

  // Ranking de clientes por reservas activas: solo ADMIN.
  app.get('/consultas/ranking', async (req, res) => {
    if (!req.user!.roles.includes('ADMIN')) throw new AuthError(403, 'Acceso denegado');
    const raw = Number(req.query.limit ?? 10);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 100) : 10;
    const items = await store.ranking(limit);
    res.json({ count: items.length, items });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Recurso no encontrado' });
  });
  app.use(errorHandler);
  return app;
};
