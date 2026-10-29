import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/endpoints';
import { reportError } from '../api/client';
import { FiltroChips, ReservaCard, type EstadoFiltro } from '../components/cards';
import { Icon } from '../components/Icon';
import { toast } from '../components/toastBus';
import { ConfirmModal, EmptyState, SkeletonCards } from '../components/ui';
import { fmtDiaHora } from '../format';
import { useAsync } from '../hooks/useAsync';
import type { ReservaDTO } from '../types';

export default function MisReservas() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [reservas, vehiculos] = await Promise.all([api.misReservas(), api.vehiculos()]);
    return { reservas, vehiculos };
  }, []);
  const [filtro, setFiltro] = useState<EstadoFiltro>('TODAS');
  const [aCancelar, setACancelar] = useState<ReservaDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const veh = useMemo(() => new Map((data?.vehiculos ?? []).map((v) => [v.id, v])), [data]);
  const reservas = data?.reservas ?? [];
  const counts = {
    TODAS: reservas.length,
    ACTIVA: reservas.filter((r) => r.estado === 'ACTIVA').length,
    CANCELADA: reservas.filter((r) => r.estado === 'CANCELADA').length,
  };
  const lista = reservas.filter((r) => filtro === 'TODAS' || r.estado === filtro);

  const cancelar = async () => {
    if (!aCancelar) return;
    setBusy(true);
    try {
      await api.cancelarReserva(aCancelar.id);
      toast.success('Reserva cancelada', 'El horario quedó liberado.');
      setACancelar(null);
      reload();
    } catch (e) {
      reportError(e, 'No se pudo cancelar la reserva.');
      setACancelar(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Mis reservas</h1><p>Consultá, modificá o cancelá tus reservas de estacionamiento.</p></div>
        <Link className="btn btn-primary" to="/reservas/nueva"><Icon name="plus" /> Nueva reserva</Link>
      </div>

      {loading && !data ? <SkeletonCards /> : error && !data ? (
        <EmptyState icon="alert" title="No pudimos cargar tus reservas" text="Revisá tu conexión e intentá nuevamente."
          action={<button className="btn btn-secondary" onClick={reload}>Reintentar</button>} />
      ) : reservas.length === 0 ? (
        <EmptyState icon="calendar" title="Todavía no tenés reservas" text="Reservá tu primer lugar de estacionamiento en pocos pasos."
          action={<Link className="btn btn-primary" to="/reservas/nueva"><Icon name="plus" /> Nueva reserva</Link>} />
      ) : (
        <div className="stack">
          <FiltroChips value={filtro} onChange={setFiltro} counts={counts} />
          {lista.length === 0
            ? <EmptyState icon="search" title="Sin resultados" text="No hay reservas con ese estado." />
            : <div className="reserva-list">{lista.map((r) => <ReservaCard key={r.id} reserva={r} vehiculo={veh.get(r.vehiculoId)} onCancel={setACancelar} />)}</div>}
        </div>
      )}

      {aCancelar && (
        <ConfirmModal
          title="¿Cancelar esta reserva?"
          text={<>Se liberará el horario del {fmtDiaHora(aCancelar.inicio)} para {veh.get(aCancelar.vehiculoId)?.matricula ?? 'tu vehículo'}. Esta acción no se puede deshacer.</>}
          confirmLabel="Sí, cancelar reserva" backLabel="Volver" busy={busy} onConfirm={cancelar} onClose={() => setACancelar(null)}
        />
      )}
    </>
  );
}
