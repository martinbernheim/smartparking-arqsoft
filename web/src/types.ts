// Tipos espejo de contracts/src (DTOs del backend).
export type Rol = 'ADMIN' | 'CLIENTE';
export type EstadoReserva = 'ACTIVA' | 'CANCELADA';

export interface AuthResponse { accessToken: string; expiresIn: number }

export interface ClienteDTO {
  id: string;
  nombre: string;
  email: string;
  telefono?: string;
  identityUserId: string;
  createdAt?: string;
}
export interface CrearClienteRequest { nombre: string; email: string; telefono?: string; password: string }
export interface ActualizarClienteRequest { nombre?: string; telefono?: string | null }

export interface VehiculoDTO { id: string; matricula: string; marca?: string; modelo?: string; clienteId: string }
export interface CrearVehiculoRequest { matricula: string; marca?: string; modelo?: string; clienteId?: string }
export interface ActualizarVehiculoRequest { matricula?: string; marca?: string | null; modelo?: string | null }

export interface ReservaDTO {
  id: string;
  vehiculoId: string;
  clienteId: string;
  inicio: string;
  fin: string;
  estado: EstadoReserva;
}
export interface CrearReservaRequest { vehiculoId: string; inicio: string; fin: string }
export interface ActualizarReservaRequest { inicio: string; fin: string }

export interface ReservaFiltro {
  clienteId?: string;
  estado?: EstadoReserva;
  desde?: string;
  hasta?: string;
  page?: number;
  pageSize?: number;
}

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

export interface ResumenCliente {
  clienteId: string;
  nombre?: string;
  email?: string;
  reservasActivas: number;
  reservasCanceladas: number;
  totalHorasReservadas: number;
  proximaReserva: { reservaId: string; vehiculoId: string; inicio: string; fin: string } | null;
}
export interface RankingResponse { count: number; items: ResumenCliente[] }
