import type { ClienteDoc, ReservaDoc, ResumenCliente, VehiculoDoc } from '../src/domain/types';
import type { ReadModelStore } from '../src/store/store';

// Implementación en memoria del puerto (mismas reglas last-write-wins que la de Mongo).
export class MemoryStore implements ReadModelStore {
  processed = new Set<string>();
  clientes = new Map<string, ClienteDoc>();
  vehiculos = new Map<string, VehiculoDoc>();
  reservas = new Map<string, ReservaDoc>();
  resumenes = new Map<string, ResumenCliente>();

  async wasProcessed(id: string) { return this.processed.has(id); }
  async markProcessed(id: string) { this.processed.add(id); }
  async mergeCliente(clienteId: string, f: Partial<Omit<ClienteDoc, 'clienteId'>>) {
    this.clientes.set(clienteId, { ...this.clientes.get(clienteId), clienteId, ...f });
  }
  async putVehiculo(d: VehiculoDoc) {
    const prev = this.vehiculos.get(d.vehiculoId);
    if (!prev || prev.version <= d.version) this.vehiculos.set(d.vehiculoId, d);
  }
  async getVehiculo(id: string) { return this.vehiculos.get(id) ?? null; }
  async putReserva(d: ReservaDoc) {
    const prev = this.reservas.get(d.reservaId);
    if (!prev || prev.version <= d.version) this.reservas.set(d.reservaId, d);
  }
  async getReserva(id: string) { return this.reservas.get(id) ?? null; }
  async deleteReserva(id: string) { this.reservas.delete(id); }
  async deleteVehiculo(id: string) {
    for (const [k, r] of this.reservas) if (r.vehiculoId === id) this.reservas.delete(k);
    this.vehiculos.delete(id);
  }
  async purgeCliente(id: string) {
    for (const [k, r] of this.reservas) if (r.clienteId === id) this.reservas.delete(k);
    for (const [k, v] of this.vehiculos) if (v.clienteId === id) this.vehiculos.delete(k);
    this.clientes.delete(id);
    this.resumenes.delete(id);
  }
  async loadAgregado(id: string) {
    return {
      cliente: this.clientes.get(id) ?? null,
      vehiculos: [...this.vehiculos.values()].filter((v) => v.clienteId === id),
      reservas: [...this.reservas.values()].filter((r) => r.clienteId === id),
    };
  }
  async saveResumen(r: ResumenCliente) { this.resumenes.set(r.clienteId, r); }
  async getResumen(id: string) { return this.resumenes.get(id) ?? null; }
  async ranking(limit: number) {
    return [...this.resumenes.values()].sort((a, b) => b.reservasActivas - a.reservasActivas).slice(0, limit);
  }
}
