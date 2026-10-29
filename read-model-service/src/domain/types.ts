// Documentos del modelo de lectura (vista derivada; la fuente de verdad es PostgreSQL).
export interface ClienteDoc {
  clienteId: string;
  nombre?: string;
  email?: string;
  identityUserId?: string;
}

export interface VehiculoDoc {
  vehiculoId: string;
  clienteId: string;
  matricula?: string;
  marca?: string | null;
  modelo?: string | null;
  version: string; // fechaHora del evento que lo produjo (last-write-wins)
}

export interface ReservaDoc {
  reservaId: string;
  clienteId: string;
  vehiculoId: string;
  inicio: string; // ISO
  fin: string; // ISO
  estado: 'ACTIVA' | 'CANCELADA';
  version: string;
}

export interface ResumenCliente {
  clienteId: string;
  nombre?: string;
  email?: string;
  identityUserId?: string;
  reservasActivas: number;
  reservasCanceladas: number;
  totalHorasReservadas: number; // horas de las reservas ACTIVAS
  proximaReserva: { reservaId: string; vehiculoId: string; inicio: string; fin: string } | null;
  ultimaActualizacion: string;
  vehiculos: Array<{ vehiculoId: string; matricula?: string; marca?: string | null; modelo?: string | null }>;
}
