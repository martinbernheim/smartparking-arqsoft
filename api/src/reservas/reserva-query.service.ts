// CQRS (lado CONSULTA) — preparación H4b.
// Solo lecturas: listados (RF4 "mis reservas", RF5 filtros admin) servidos desde la réplica de lectura
// con caché cache-aside en Redis (TTL corto). No escribe en la BD ni publica eventos; la invalidación
// la dispara ReservaCommandService. Cada respuesta indica HIT/MISS (cabecera X-Cache).
import type { ReservaFiltroDTO } from '@smartparking/contracts';
import type { Actor } from '../auth/auth.types';
import { miasKey, type CacheService, type CacheStatus } from '../cache/cache.service';
import { BadRequest } from '../shared/bad-request';
import { NotFoundError } from '../shared/errors';
import type { Page } from '../shared/page';
import type { Reserva, ReservaRepository } from './reserva.repository';

export interface Cached<T> {
  value: T;
  cache: CacheStatus;
}

// JSON convierte Date en string: se rehidratan al leer de Redis.
const revive = (r: Reserva): Reserva => ({ ...r, inicio: new Date(r.inicio), fin: new Date(r.fin) });

export class ReservaQueryService {
  constructor(
    private readonly repo: ReservaRepository,
    private readonly cache: CacheService,
  ) {}

  async obtener(actor: Actor, id: string): Promise<Reserva> {
    const r = await this.repo.findById(id);
    if (!r || (!actor.isAdmin && r.clienteId !== actor.clienteId)) throw new NotFoundError('Reserva no encontrada');
    return r;
  }

  // RF4: el cliente sale exclusivamente del JWT (actor.clienteId).
  async misReservas(actor: Actor): Promise<Cached<Reserva[]>> {
    const key = miasKey(actor.clienteId!);
    const hit = await this.cache.getJson<Reserva[]>(key);
    if (hit) return { value: hit.map(revive), cache: 'HIT' };
    const value = await this.repo.listByCliente(actor.clienteId!);
    await this.cache.setJson(key, value);
    return { value, cache: 'MISS' };
  }

  // RF5
  async buscar(filtro: ReservaFiltroDTO): Promise<Cached<Page<Reserva>>> {
    if (filtro.desde && filtro.hasta && new Date(filtro.hasta) <= new Date(filtro.desde)) {
      throw new BadRequest('hasta debe ser posterior a desde');
    }
    const key = await this.cache.adminKey(filtro);
    const hit = await this.cache.getJson<Page<Reserva>>(key);
    if (hit) return { value: { ...hit, items: hit.items.map(revive) }, cache: 'HIT' };
    const value = await this.repo.search(filtro);
    await this.cache.setJson(key, value);
    return { value, cache: 'MISS' };
  }
}
