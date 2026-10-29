import type { ClienteDoc, ReservaDoc, ResumenCliente, VehiculoDoc } from '../domain/types';

// Puerto de persistencia del modelo de lectura. `put*` aplican last-write-wins por `version`
// (tolera eventos desordenados); `markProcessed` + `wasProcessed` dan idempotencia por eventId.
export interface ReadModelStore {
  wasProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string): Promise<void>;

  mergeCliente(clienteId: string, fields: Partial<Omit<ClienteDoc, 'clienteId'>>): Promise<void>;
  putVehiculo(doc: VehiculoDoc): Promise<void>;
  getVehiculo(vehiculoId: string): Promise<VehiculoDoc | null>;
  putReserva(doc: ReservaDoc): Promise<void>;
  getReserva(reservaId: string): Promise<ReservaDoc | null>;

  deleteReserva(reservaId: string): Promise<void>;
  deleteVehiculo(vehiculoId: string): Promise<void>; // junto con sus reservas
  purgeCliente(clienteId: string): Promise<void>; // cliente, vehículos, reservas y resumen

  loadAgregado(clienteId: string): Promise<{ cliente: ClienteDoc | null; vehiculos: VehiculoDoc[]; reservas: ReservaDoc[] }>;
  saveResumen(resumen: ResumenCliente): Promise<void>;
  getResumen(clienteId: string): Promise<ResumenCliente | null>;
  ranking(limit: number): Promise<ResumenCliente[]>;
}
