import type { Collection, Db } from 'mongodb';
import type { ClienteDoc, ReservaDoc, ResumenCliente, VehiculoDoc } from '../domain/types';
import type { ReadModelStore } from './store';

const DUP_KEY = 11000;
const strip = <T extends { _id?: unknown }>(d: T | null): Omit<T, '_id'> | null => {
  if (!d) return null;
  const { _id, ...rest } = d;
  return rest;
};

/**
 * Colecciones de `smartparking_read`:
 *  - resumen_cliente (la vista consultada), más el estado proyectado que la alimenta:
 *    clientes_proy, vehiculos_proy, reservas_proy y eventos_procesados (eventId, TTL 30 días).
 */
export class MongoReadModelStore implements ReadModelStore {
  private readonly resumenes: Collection<any>;
  private readonly clientes: Collection<any>;
  private readonly vehiculos: Collection<any>;
  private readonly reservas: Collection<any>;
  private readonly procesados: Collection<any>;

  constructor(db: Db) {
    this.resumenes = db.collection('resumen_cliente');
    this.clientes = db.collection('clientes_proy');
    this.vehiculos = db.collection('vehiculos_proy');
    this.reservas = db.collection('reservas_proy');
    this.procesados = db.collection('eventos_procesados');
  }

  async ensureIndexes(): Promise<void> {
    await this.resumenes.createIndex({ reservasActivas: -1, clienteId: 1 });
    await this.vehiculos.createIndex({ clienteId: 1 });
    await this.reservas.createIndex({ clienteId: 1 });
    await this.reservas.createIndex({ vehiculoId: 1 });
    await this.procesados.createIndex({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
  }

  async wasProcessed(eventId: string) {
    return (await this.procesados.countDocuments({ _id: eventId }, { limit: 1 })) > 0;
  }
  async markProcessed(eventId: string) {
    await this.procesados.updateOne({ _id: eventId }, { $setOnInsert: { at: new Date() } }, { upsert: true });
  }

  async mergeCliente(clienteId: string, fields: Partial<Omit<ClienteDoc, 'clienteId'>>) {
    await this.clientes.updateOne({ _id: clienteId }, { $set: { clienteId, ...fields } }, { upsert: true });
  }

  // last-write-wins: si ya existe un doc con version mayor, el filtro no matchea y el upsert choca con _id (ignorado).
  private async putLww(col: Collection<any>, id: string, doc: { version: string }) {
    try {
      await col.updateOne({ _id: id, version: { $lte: doc.version } }, { $set: doc }, { upsert: true });
    } catch (e) {
      if ((e as { code?: number }).code !== DUP_KEY) throw e;
    }
  }

  putVehiculo(doc: VehiculoDoc) {
    return this.putLww(this.vehiculos, doc.vehiculoId, doc);
  }
  async getVehiculo(id: string) {
    return strip(await this.vehiculos.findOne({ _id: id })) as VehiculoDoc | null;
  }
  putReserva(doc: ReservaDoc) {
    return this.putLww(this.reservas, doc.reservaId, doc);
  }
  async getReserva(id: string) {
    return strip(await this.reservas.findOne({ _id: id })) as ReservaDoc | null;
  }

  async deleteReserva(id: string) {
    await this.reservas.deleteOne({ _id: id });
  }
  async deleteVehiculo(id: string) {
    await this.reservas.deleteMany({ vehiculoId: id });
    await this.vehiculos.deleteOne({ _id: id });
  }
  async purgeCliente(clienteId: string) {
    await Promise.all([
      this.reservas.deleteMany({ clienteId }),
      this.vehiculos.deleteMany({ clienteId }),
      this.clientes.deleteOne({ _id: clienteId }),
      this.resumenes.deleteOne({ _id: clienteId }),
    ]);
  }

  async loadAgregado(clienteId: string) {
    const [cliente, vehiculos, reservas] = await Promise.all([
      this.clientes.findOne({ _id: clienteId }),
      this.vehiculos.find({ clienteId }).toArray(),
      this.reservas.find({ clienteId }).toArray(),
    ]);
    return {
      cliente: strip(cliente) as ClienteDoc | null,
      vehiculos: vehiculos.map((v) => strip(v) as VehiculoDoc),
      reservas: reservas.map((r) => strip(r) as ReservaDoc),
    };
  }

  async saveResumen(r: ResumenCliente) {
    await this.resumenes.replaceOne({ _id: r.clienteId }, r, { upsert: true });
  }
  async getResumen(clienteId: string) {
    return strip(await this.resumenes.findOne({ _id: clienteId })) as ResumenCliente | null;
  }
  async ranking(limit: number) {
    const rows = await this.resumenes.find({}).sort({ reservasActivas: -1, clienteId: 1 }).limit(limit).toArray();
    return rows.map((r) => strip(r) as ResumenCliente);
  }
}
