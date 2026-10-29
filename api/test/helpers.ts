import { generateKeyPairSync, randomUUID, type KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { EventoAuditoriaDTO, Rol } from '@smartparking/contracts';
import { createApp } from '../src/app';
import type { IAuditEventPublisher } from '../src/audit/audit-event-publisher';
import type { IJwks } from '../src/auth/jwks-client';
import type { Cliente, ClienteRepository } from '../src/clientes/cliente.repository';
import type { IUserAdmin } from '../src/identity/user-admin.client';
import { MSG_SOLAPAMIENTO, type Reserva, type ReservaRepository } from '../src/reservas/reserva.repository';
import { ConflictError, NotFoundError } from '../src/shared/errors';
import type { Vehiculo, VehiculoRepository } from '../src/vehiculos/vehiculo.repository';

export const ISSUER = 'test-issuer';
export const KID = 'test-kid';

const pair = () => generateKeyPairSync('rsa', { modulusLength: 2048 });
export const keys = pair();
export const otherKeys = pair(); // par ajeno: firma inválida

export const staticJwks = (publicKey: KeyObject = keys.publicKey): IJwks => ({
  async getKey(kid) {
    if (kid !== KID) throw new Error('kid desconocido');
    return publicKey;
  },
});

export function signToken(
  sub: string,
  roles: Rol[],
  opts: { privateKey?: KeyObject; expiresIn?: number; issuer?: string; kid?: string } = {},
): string {
  return jwt.sign({ roles }, opts.privateKey ?? keys.privateKey, {
    algorithm: 'RS256',
    subject: sub,
    issuer: opts.issuer ?? ISSUER,
    expiresIn: opts.expiresIn ?? 3600,
    keyid: opts.kid ?? KID,
  });
}

// ---------- Repositorios en memoria ----------
export class MemClientes implements ClienteRepository {
  rows: Cliente[] = [];
  vehiculos?: MemVehiculos;
  reservas?: MemReservas;
  async create(d: { nombre: string; email: string; telefono?: string | null; identityUserId: string }) {
    if (this.rows.some((c) => c.email === d.email)) throw new ConflictError('dup');
    const c: Cliente = { id: randomUUID(), createdAt: new Date(), ...d, telefono: d.telefono ?? null };
    this.rows.push(c);
    return c;
  }
  async findById(id: string) { return this.rows.find((c) => c.id === id) ?? null; }
  async findByEmail(email: string) { return this.rows.find((c) => c.email === email) ?? null; }
  async findByIdentityUserId(i: string) { return this.rows.find((c) => c.identityUserId === i) ?? null; }
  async findClienteIdByIdentityUserId(i: string) { return (await this.findByIdentityUserId(i))?.id ?? null; }
  async list(page: number, pageSize: number) {
    return { items: this.rows.slice((page - 1) * pageSize, page * pageSize), total: this.rows.length, page, pageSize };
  }
  async update(id: string, d: { nombre?: string; telefono?: string | null }) {
    const c = this.rows.find((x) => x.id === id);
    if (!c) throw new NotFoundError();
    Object.assign(c, d);
    return c;
  }
  async countReservasActivas(id: string) {
    return this.reservas!.rows.filter((r) => r.clienteId === id && r.estado === 'ACTIVA').length;
  }
  async delete(id: string) { this.rows = this.rows.filter((c) => c.id !== id); }
}

export class MemVehiculos implements VehiculoRepository {
  rows: Vehiculo[] = [];
  reservas?: MemReservas;
  async create(d: { matricula: string; marca?: string; modelo?: string; clienteId: string }) {
    if (this.rows.some((v) => v.matricula === d.matricula)) throw new ConflictError('dup');
    const v: Vehiculo = { id: randomUUID(), marca: d.marca ?? null, modelo: d.modelo ?? null, matricula: d.matricula, clienteId: d.clienteId };
    this.rows.push(v);
    return v;
  }
  async findById(id: string) { return this.rows.find((v) => v.id === id) ?? null; }
  async list(f: { clienteId?: string }) { return this.rows.filter((v) => !f.clienteId || v.clienteId === f.clienteId); }
  async update(id: string, d: { matricula?: string; marca?: string | null; modelo?: string | null }) {
    const v = this.rows.find((x) => x.id === id);
    if (!v) throw new NotFoundError();
    Object.assign(v, d);
    return v;
  }
  async countReservasActivas(id: string) {
    return this.reservas!.rows.filter((r) => r.vehiculoId === id && r.estado === 'ACTIVA').length;
  }
  async delete(id: string) { this.rows = this.rows.filter((v) => v.id !== id); }
}

export class MemReservas implements ReservaRepository {
  rows: Reserva[] = [];
  /** Simula la constraint EXCLUDE de Postgres (23P01 -> 409) incluso si el service no chequea. */
  enforceConstraint = true;
  private overlap(vehiculoId: string, inicio: Date, fin: Date, excludeId?: string) {
    return this.rows.some(
      (r) => r.vehiculoId === vehiculoId && r.estado === 'ACTIVA' && r.id !== excludeId && r.inicio < fin && r.fin > inicio,
    );
  }
  async create(d: { clienteId: string; vehiculoId: string; inicio: Date; fin: Date }) {
    if (this.enforceConstraint && this.overlap(d.vehiculoId, d.inicio, d.fin)) throw new ConflictError(MSG_SOLAPAMIENTO);
    const r: Reserva = { id: randomUUID(), estado: 'ACTIVA', ...d };
    this.rows.push(r);
    return r;
  }
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async update(id: string, d: { inicio?: Date; fin?: Date; estado?: 'ACTIVA' | 'CANCELADA' }) {
    const r = this.rows.find((x) => x.id === id);
    if (!r) throw new NotFoundError();
    Object.assign(r, d);
    return r;
  }
  async existsOverlap(v: string, i: Date, f: Date, ex?: string) { return this.overlap(v, i, f, ex); }
  async listByCliente(clienteId: string) { return this.rows.filter((r) => r.clienteId === clienteId); }
  async search(f: { clienteId?: string; estado?: string; desde?: string; hasta?: string; page: number; pageSize: number }) {
    const all = this.rows.filter(
      (r) =>
        (!f.clienteId || r.clienteId === f.clienteId) &&
        (!f.estado || r.estado === f.estado) &&
        (!f.desde || r.fin > new Date(f.desde)) &&
        (!f.hasta || r.inicio < new Date(f.hasta)),
    );
    return { items: all.slice((f.page - 1) * f.pageSize, f.page * f.pageSize), total: all.length, page: f.page, pageSize: f.pageSize };
  }
}

export class RecordingAudit implements IAuditEventPublisher {
  events: EventoAuditoriaDTO[] = [];
  async publicar(e: EventoAuditoriaDTO) { this.events.push(e); }
}

export class FakeUserAdmin implements IUserAdmin {
  calls: { token: string; email: string; rol: string }[] = [];
  async crearUsuario(token: string, req: { email: string; password: string; rol: string }) {
    this.calls.push({ token, email: req.email, rol: req.rol });
    return { identityUserId: `idn-${this.calls.length}` };
  }
}

// ---------- Escenario completo ----------
export function buildWorld() {
  const clientes = new MemClientes();
  const vehiculos = new MemVehiculos();
  const reservas = new MemReservas();
  clientes.vehiculos = vehiculos;
  clientes.reservas = reservas;
  vehiculos.reservas = reservas;
  const audit = new RecordingAudit();
  const userAdmin = new FakeUserAdmin();
  const app = createApp({
    env: { JWT_ISSUER: ISSUER, INSTANCE_ID: 'test' },
    jwks: staticJwks(),
    clientes, vehiculos, reservas, userAdmin, audit,
  });

  const mkCliente = async (n: number) => {
    const c = await clientes.create({ nombre: `C${n}`, email: `c${n}@t.local`, identityUserId: `user-${n}` });
    const v = await vehiculos.create({ matricula: `SBA 000${n}`, clienteId: c.id });
    return { cliente: c, vehiculo: v, token: signToken(c.identityUserId, ['CLIENTE']) };
  };
  return { app, clientes, vehiculos, reservas, audit, userAdmin, mkCliente, adminToken: signToken('admin-1', ['ADMIN']) };
}

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
