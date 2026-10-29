import type { ActualizarClienteRequest, CrearClienteRequest } from '@smartparking/contracts';
import { emitirAuditoria, type IAuditEventPublisher } from '../audit/audit-event-publisher';
import type { Actor } from '../auth/auth.types';
import type { IUserAdmin } from '../identity/user-admin.client';
import { logger } from '../logger';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors';
import type { Page } from '../shared/page';
import type { Cliente, ClienteRepository } from './cliente.repository';

export class ClientesService {
  constructor(
    private readonly repo: ClienteRepository,
    private readonly identity: IUserAdmin,
    private readonly audit: IAuditEventPublisher,
  ) {}

  // RF1. 1) usuario en Identity (reenviando el JWT del ADMIN, D9)  2) fila Cliente con identityUserId.
  // Si el paso 2 falla, el usuario de Identity queda huérfano: se registra para reconciliación manual
  // (la compensación automática queda fuera de alcance).
  async crear(actor: Actor, bearerToken: string, req: CrearClienteRequest): Promise<Cliente> {
    const email = req.email.toLowerCase();
    if (await this.repo.findByEmail(email)) throw new ConflictError('Ya existe un cliente con ese email');

    const { identityUserId } = await this.identity.crearUsuario(bearerToken, {
      email,
      password: req.password,
      rol: 'CLIENTE',
    });

    let cliente: Cliente;
    try {
      cliente = await this.repo.create({ nombre: req.nombre, email, telefono: req.telefono ?? null, identityUserId });
    } catch (e) {
      logger.error('INCONSISTENCIA: usuario creado en Identity pero falló el alta del Cliente (usuario huérfano)', {
        identityUserId,
        email,
        reason: (e as Error)?.message,
      });
      throw e;
    }
    emitirAuditoria(this.audit, 'CREAR', 'Cliente', cliente.id, actor.userId);
    return cliente;
  }

  list(page: number, pageSize: number): Promise<Page<Cliente>> {
    return this.repo.list(page, pageSize);
  }

  async obtener(id: string): Promise<Cliente> {
    const c = await this.repo.findById(id);
    if (!c) throw new NotFoundError('Cliente no encontrado');
    return c;
  }

  // GET /clientes/me: el cliente sale del JWT (sub), nunca del request.
  async miPerfil(sub: string): Promise<Cliente> {
    const c = await this.repo.findByIdentityUserId(sub);
    if (!c) throw new ForbiddenError('El usuario no tiene un cliente asociado');
    return c;
  }

  async actualizar(actor: Actor, id: string, req: ActualizarClienteRequest): Promise<Cliente> {
    await this.obtener(id);
    const c = await this.repo.update(id, req);
    emitirAuditoria(this.audit, 'MODIFICAR', 'Cliente', c.id, actor.userId);
    return c;
  }

  async eliminar(actor: Actor, id: string): Promise<void> {
    await this.obtener(id);
    if ((await this.repo.countReservasActivas(id)) > 0) {
      throw new ConflictError('No se puede eliminar un cliente con reservas activas');
    }
    await this.repo.delete(id);
    emitirAuditoria(this.audit, 'ELIMINAR', 'Cliente', id, actor.userId);
  }
}
