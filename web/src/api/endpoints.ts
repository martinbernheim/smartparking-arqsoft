import { http, PATHS } from './client';
import type {
  ActualizarClienteRequest, ActualizarReservaRequest, ActualizarVehiculoRequest, AuthResponse, ClienteDTO,
  CrearClienteRequest, CrearReservaRequest, CrearVehiculoRequest, Page, ReservaDTO, RankingResponse, ReservaFiltro, VehiculoDTO,
} from '../types';

export const api = {
  login: (email: string, password: string) => http.post<AuthResponse>(PATHS.login, { email, password }, false),

  clienteMe: () => http.get<ClienteDTO>(PATHS.clienteMe),
  clientes: (page = 1, pageSize = 20) => http.get<Page<ClienteDTO>>(PATHS.clientes, { page, pageSize }),
  crearCliente: (b: CrearClienteRequest) => http.post<ClienteDTO>(PATHS.clientes, b),
  actualizarCliente: (id: string, b: ActualizarClienteRequest) => http.put<ClienteDTO>(`${PATHS.clientes}/${id}`, b),
  eliminarCliente: (id: string) => http.del(`${PATHS.clientes}/${id}`),

  vehiculos: (clienteId?: string) => http.get<VehiculoDTO[]>(PATHS.vehiculos, { clienteId }),
  crearVehiculo: (b: CrearVehiculoRequest) => http.post<VehiculoDTO>(PATHS.vehiculos, b),
  actualizarVehiculo: (id: string, b: ActualizarVehiculoRequest) => http.put<VehiculoDTO>(`${PATHS.vehiculos}/${id}`, b),
  eliminarVehiculo: (id: string) => http.del(`${PATHS.vehiculos}/${id}`),

  reserva: (id: string) => http.get<ReservaDTO>(`${PATHS.reservas}/${id}`),
  misReservas: () => http.get<ReservaDTO[]>(PATHS.reservasMias),
  crearReserva: (b: CrearReservaRequest) => http.post<ReservaDTO>(PATHS.reservas, b),
  actualizarReserva: (id: string, b: ActualizarReservaRequest) => http.put<ReservaDTO>(`${PATHS.reservas}/${id}`, b),
  cancelarReserva: (id: string) => http.post<ReservaDTO>(PATHS.reservaCancelar(id)),
  adminReservas: (f: ReservaFiltro) => http.get<Page<ReservaDTO>>(PATHS.adminReservas, { ...f }),
  // Modelo de lectura CQRS (read-model-service)
  ranking: (limit = 5) => http.get<RankingResponse>(PATHS.ranking, { limit }),
};
