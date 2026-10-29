import type { ClienteDoc, ReservaDoc, ResumenCliente, VehiculoDoc } from './types';

// Cálculo puro del resumen a partir del estado proyectado del cliente.
export function computeResumen(
  clienteId: string,
  cliente: ClienteDoc | null,
  vehiculos: VehiculoDoc[],
  reservas: ReservaDoc[],
  now: Date = new Date(),
): ResumenCliente {
  const activas = reservas.filter((r) => r.estado === 'ACTIVA');
  const horas = activas.reduce((acc, r) => acc + (Date.parse(r.fin) - Date.parse(r.inicio)) / 3_600_000, 0);
  const proxima =
    activas
      .filter((r) => Date.parse(r.inicio) >= now.getTime())
      .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))[0] ?? null;

  return {
    clienteId,
    ...(cliente?.nombre !== undefined ? { nombre: cliente.nombre } : {}),
    ...(cliente?.email !== undefined ? { email: cliente.email } : {}),
    ...(cliente?.identityUserId !== undefined ? { identityUserId: cliente.identityUserId } : {}),
    reservasActivas: activas.length,
    reservasCanceladas: reservas.length - activas.length,
    totalHorasReservadas: Math.round(horas * 100) / 100,
    proximaReserva: proxima
      ? { reservaId: proxima.reservaId, vehiculoId: proxima.vehiculoId, inicio: proxima.inicio, fin: proxima.fin }
      : null,
    ultimaActualizacion: now.toISOString(),
    vehiculos: vehiculos
      .map((v) => ({ vehiculoId: v.vehiculoId, matricula: v.matricula, marca: v.marca, modelo: v.modelo }))
      .sort((a, b) => (a.matricula ?? '').localeCompare(b.matricula ?? '')),
  };
}
