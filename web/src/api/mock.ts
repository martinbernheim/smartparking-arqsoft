// Modo demo sin backend (VITE_MOCK=1). Solo para desarrollo: datos de ejemplo en memoria.
import { ApiError } from './client';
import type { ClienteDTO, EstadoReserva, ReservaDTO, Rol, VehiculoDTO } from '../types';

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
export function fakeToken(rol: Rol, hours = 1): string {
  const sub = rol === 'ADMIN' ? 'u-admin' : 'u-cli1';
  return `${b64({ alg: 'none' })}.${b64({ sub, roles: [rol], exp: Math.floor(Date.now() / 1000) + hours * 3600 })}.mock`;
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = (d: number, h: number, m = 0) => {
  const t = new Date();
  t.setDate(t.getDate() + d);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
};

const clientes: ClienteDTO[] = [
  { id: id(1), nombre: 'María Fernández', email: 'cliente1@smartparking.local', telefono: '+598 99 123 456', identityUserId: 'u-cli1' },
  { id: id(2), nombre: 'Santiago Rodríguez', email: 'cliente2@smartparking.local', telefono: '+598 94 555 210', identityUserId: 'u-cli2' },
  { id: id(3), nombre: 'Valentina Pereira', email: 'valentina.pereira@correo.com.uy', identityUserId: 'u-cli3' },
  { id: id(4), nombre: 'Joaquín Techera', email: 'joaquin.techera@correo.com.uy', telefono: '+598 98 777 341', identityUserId: 'u-cli4' },
];
const vehiculos: VehiculoDTO[] = [
  { id: id(11), matricula: 'SBA 1234', marca: 'Toyota', modelo: 'Corolla', clienteId: id(1) },
  { id: id(12), matricula: 'SCD 5678', marca: 'Volkswagen', modelo: 'Polo', clienteId: id(1) },
  { id: id(13), matricula: 'SAC 4410', marca: 'Chevrolet', modelo: 'Onix', clienteId: id(2) },
  { id: id(14), matricula: 'SBK 7783', marca: 'Renault', modelo: 'Kangoo', clienteId: id(3) },
  { id: id(15), matricula: 'SDF 2096', clienteId: id(4) },
];
const reservas: ReservaDTO[] = [
  { id: id(101), vehiculoId: id(11), clienteId: id(1), inicio: iso(1, 9), fin: iso(1, 18), estado: 'ACTIVA' },
  { id: id(102), vehiculoId: id(12), clienteId: id(1), inicio: iso(3, 8, 30), fin: iso(3, 13), estado: 'ACTIVA' },
  { id: id(103), vehiculoId: id(11), clienteId: id(1), inicio: iso(-2, 10), fin: iso(-2, 15), estado: 'CANCELADA' },
  { id: id(104), vehiculoId: id(13), clienteId: id(2), inicio: iso(1, 8), fin: iso(1, 12, 30), estado: 'ACTIVA' },
  { id: id(105), vehiculoId: id(14), clienteId: id(3), inicio: iso(2, 10), fin: iso(2, 17), estado: 'ACTIVA' },
  { id: id(106), vehiculoId: id(15), clienteId: id(4), inicio: iso(4, 7), fin: iso(4, 9, 30), estado: 'CANCELADA' },
  { id: id(107), vehiculoId: id(13), clienteId: id(2), inicio: iso(5, 15), fin: iso(5, 21), estado: 'ACTIVA' },
  { id: id(108), vehiculoId: id(12), clienteId: id(1), inicio: iso(-5, 9), fin: iso(-5, 12), estado: 'ACTIVA' },
];
let seq = 900;

const wait = () => new Promise((r) => setTimeout(r, 250));
const me = () => {
  const t = sessionStorage.getItem('sp.token') ?? '';
  const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  return { admin: (p.roles as string[]).includes('ADMIN'), sub: p.sub as string };
};
const myCliente = () => clientes.find((c) => c.identityUserId === me().sub)!;
const overlap = (vehiculoId: string, ini: string, fin: string, excl?: string) =>
  reservas.some((r) => r.id !== excl && r.vehiculoId === vehiculoId && r.estado === 'ACTIVA' && r.inicio < fin && ini < r.fin);

export async function mockRequest<T>(method: string, path: string, opts: { body?: any; query?: Record<string, any> } = {}): Promise<T> {
  await wait();
  const { body, query = {} } = opts;
  const out = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as T;
  const m = (re: RegExp) => re.exec(path);

  if (path === '/auth/login') {
    const ok = (body.email === 'admin@smartparking.local' && body.password === 'Admin123!') ||
      (/^cliente[12]@smartparking\.local$/.test(body.email) && body.password === 'Cliente123!');
    if (!ok) throw new ApiError(401, 'Credenciales inválidas');
    return out({ accessToken: fakeToken(body.email.startsWith('admin') ? 'ADMIN' : 'CLIENTE'), expiresIn: 3600 });
  }
  if (path === '/api/clientes/me') return out(myCliente());

  if (path === '/api/clientes') {
    if (method === 'POST') {
      if (clientes.some((c) => c.email === body.email)) throw new ApiError(409, 'Ya existe un cliente con ese email');
      const c: ClienteDTO = { id: id(++seq), nombre: body.nombre, email: body.email, telefono: body.telefono, identityUserId: `u-${seq}` };
      clientes.push(c);
      return out(c);
    }
    const page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? 20);
    return out({ items: clientes.slice((page - 1) * pageSize, page * pageSize), total: clientes.length, page, pageSize });
  }
  let r = m(/^\/api\/clientes\/([^/]+)$/);
  if (r) {
    const c = clientes.find((x) => x.id === r![1]);
    if (!c) throw new ApiError(404, 'Cliente no encontrado');
    if (method === 'PUT') { Object.assign(c, body); return out(c); }
    if (method === 'DELETE') {
      if (reservas.some((x) => x.clienteId === c.id && x.estado === 'ACTIVA')) throw new ApiError(409, 'No se puede eliminar un cliente con reservas activas');
      clientes.splice(clientes.indexOf(c), 1);
      return undefined as T;
    }
    return out(c);
  }

  if (path === '/api/vehiculos') {
    if (method === 'POST') {
      if (vehiculos.some((v) => v.matricula.replace(/\s/g, '') === String(body.matricula).replace(/\s/g, '').toUpperCase())) throw new ApiError(409, 'Ya existe un vehículo con esa matrícula');
      const v: VehiculoDTO = { id: id(++seq), matricula: String(body.matricula).toUpperCase(), marca: body.marca, modelo: body.modelo, clienteId: me().admin ? body.clienteId : myCliente().id };
      vehiculos.push(v);
      return out(v);
    }
    const cid = me().admin ? query.clienteId : myCliente().id;
    return out(vehiculos.filter((v) => !cid || v.clienteId === cid));
  }
  r = m(/^\/api\/vehiculos\/([^/]+)$/);
  if (r) {
    const v = vehiculos.find((x) => x.id === r![1]);
    if (!v) throw new ApiError(404, 'Vehículo no encontrado');
    if (method === 'PUT') { Object.assign(v, body); return out(v); }
    if (method === 'DELETE') {
      if (reservas.some((x) => x.vehiculoId === v.id && x.estado === 'ACTIVA')) throw new ApiError(409, 'El vehículo tiene reservas activas');
      vehiculos.splice(vehiculos.indexOf(v), 1);
      return undefined as T;
    }
    return out(v);
  }

  if (path === '/api/reservas/mias') {
    const c = myCliente().id;
    return out(reservas.filter((x) => x.clienteId === c).sort((a, b) => b.inicio.localeCompare(a.inicio)));
  }
  if (path === '/api/reservas' && method === 'POST') {
    const v = vehiculos.find((x) => x.id === body.vehiculoId);
    if (!v) throw new ApiError(404, 'Vehículo no encontrado');
    if (new Date(body.fin) <= new Date(body.inicio)) throw new ApiError(400, 'Solicitud inválida', [{ path: ['fin'], message: 'fin debe ser posterior a inicio' }]);
    if (overlap(v.id, body.inicio, body.fin)) throw new ApiError(409, 'El vehículo ya tiene una reserva activa en ese horario');
    const n: ReservaDTO = { id: id(++seq), vehiculoId: v.id, clienteId: v.clienteId, inicio: body.inicio, fin: body.fin, estado: 'ACTIVA' };
    reservas.push(n);
    return out(n);
  }
  r = m(/^\/api\/reservas\/([^/]+)\/cancelar$/);
  if (r) {
    const x = reservas.find((q) => q.id === r![1]);
    if (!x) throw new ApiError(404, 'Reserva no encontrada');
    x.estado = 'CANCELADA' as EstadoReserva;
    return out(x);
  }
  r = m(/^\/api\/reservas\/([^/]+)$/);
  if (r) {
    const x = reservas.find((q) => q.id === r![1]);
    if (!x) throw new ApiError(404, 'Reserva no encontrada');
    if (method === 'PUT') {
      if (new Date(body.fin) <= new Date(body.inicio)) throw new ApiError(400, 'Solicitud inválida', [{ path: ['fin'], message: 'fin debe ser posterior a inicio' }]);
      if (overlap(x.vehiculoId, body.inicio, body.fin, x.id)) throw new ApiError(409, 'El vehículo ya tiene una reserva activa en ese horario');
      x.inicio = body.inicio; x.fin = body.fin;
    }
    return out(x);
  }
  if (path === '/api/admin/reservas') {
    const page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? 20);
    const list = reservas
      .filter((x) => (!query.clienteId || x.clienteId === query.clienteId) && (!query.estado || x.estado === query.estado) &&
        (!query.desde || x.fin > query.desde) && (!query.hasta || x.inicio < query.hasta))
      .sort((a, b) => b.inicio.localeCompare(a.inicio));
    return out({ items: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize });
  }
  throw new ApiError(404, 'No encontrado (mock)');
}
