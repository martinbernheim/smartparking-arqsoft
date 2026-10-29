import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { reportError } from '../api/client';
import { api } from '../api/endpoints';
import { FILTRO_VACIO, FiltroReservas, type FiltroAdmin } from '../components/cards';
import { Icon } from '../components/Icon';
import { toast } from '../components/toastBus';
import { Avatar, ConfirmModal, DataTable, EmptyState, EstadoBadge, KpiTile, Pagination, Plate, type Column } from '../components/ui';
import { fmtCorto, iniciales } from '../format';
import { useAsync } from '../hooks/useAsync';
import type { ReservaDTO, ReservaFiltro, ResumenCliente } from '../types';

const PAGE_SIZE = 10;

function toApiFiltro(f: FiltroAdmin, page: number): ReservaFiltro {
  return {
    clienteId: f.clienteId || undefined,
    estado: f.estado || undefined,
    desde: f.desde ? new Date(`${f.desde}T00:00:00`).toISOString() : undefined,
    hasta: f.hasta ? new Date(`${f.hasta}T23:59:59`).toISOString() : undefined,
    page,
    pageSize: PAGE_SIZE,
  };
}

const rankingColumns: Column<ResumenCliente>[] = [
  { key: 'cli', header: 'Cliente', cell: (c) => <strong>{c.nombre ?? c.email ?? `Cliente ${c.clienteId.slice(0, 8)}`}</strong> },
  { key: 'act', header: 'Activas', cell: (c) => c.reservasActivas },
  { key: 'can', header: 'Canceladas', cell: (c) => c.reservasCanceladas },
  { key: 'hrs', header: 'Horas reservadas', cell: (c) => c.totalHorasReservadas },
  { key: 'prox', header: 'Próxima reserva', cell: (c) => (c.proximaReserva ? fmtCorto(c.proximaReserva.inicio) : '—') },
];

export default function AdminReservas() {
  const [filtro, setFiltro] = useState<FiltroAdmin>(FILTRO_VACIO);
  const [page, setPage] = useState(1);
  const [aCancelar, setACancelar] = useState<ReservaDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const ref = useAsync(async () => {
    const [clientes, vehiculos] = await Promise.all([api.clientes(1, 100), api.vehiculos()]);
    return { clientes: clientes.items, vehiculos };
  }, []);
  const res = useAsync(() => api.adminReservas(toApiFiltro(filtro, page)), [filtro, page]);

  const ranking = useAsync(() => api.ranking(5), []);

  const clientes = useMemo(() => new Map((ref.data?.clientes ?? []).map((c) => [c.id, c])), [ref.data]);
  const vehiculos = useMemo(() => new Map((ref.data?.vehiculos ?? []).map((v) => [v.id, v])), [ref.data]);
  const items = res.data?.items ?? [];
  const activas = items.filter((r) => r.estado === 'ACTIVA').length;

  const cancelar = async () => {
    if (!aCancelar) return;
    setBusy(true);
    try {
      await api.cancelarReserva(aCancelar.id);
      toast.success('Reserva cancelada');
    } catch (e) {
      reportError(e, 'No se pudo cancelar la reserva.');
    } finally {
      setBusy(false);
      setACancelar(null);
      res.reload();
      ranking.reload();
    }
  };

  const columns: Column<ReservaDTO>[] = [
    {
      key: 'cli', header: 'Cliente', cell: (r) => {
        const c = clientes.get(r.clienteId);
        return (
          <div className="cell-user">
            <Avatar text={iniciales(c?.nombre ?? '?')} small />
            <div><strong>{c?.nombre ?? 'Cliente'}</strong><div className="small muted">{c?.email ?? r.clienteId.slice(0, 8)}</div></div>
          </div>
        );
      },
    },
    { key: 'veh', header: 'Vehículo', cell: (r) => <Plate small matricula={vehiculos.get(r.vehiculoId)?.matricula ?? '—'} /> },
    { key: 'ini', header: 'Inicio', cell: (r) => fmtCorto(r.inicio) },
    { key: 'fin', header: 'Fin', cell: (r) => fmtCorto(r.fin) },
    { key: 'est', header: 'Estado', cell: (r) => <EstadoBadge estado={r.estado} /> },
    {
      key: 'act', header: 'Acciones', className: 'actions', cell: (r) => r.estado === 'ACTIVA' ? (
        <div className="row-actions">
          <Link className="btn btn-ghost btn-icon" to={`/reservas/${r.id}/editar`} title="Modificar" aria-label="Modificar reserva"><Icon name="pencil" /></Link>
          <button className="btn btn-danger btn-icon" title="Cancelar" aria-label="Cancelar reserva" onClick={() => setACancelar(r)}><Icon name="ban" /></button>
        </div>
      ) : <span className="small muted">—</span>,
    },
  ];

  return (
    <>
      <div className="page-head"><div><h1>Reservas</h1><p>Vista global de todas las reservas del sistema.</p></div></div>

      <section className="kpis" aria-label="Indicadores">
        <KpiTile icon="calendar" tone="blue" value={res.data ? res.data.total : '–'} label="Reservas encontradas (según filtros)" />
        <KpiTile icon="check" tone="violet" value={res.data ? activas : '–'} label="Activas en esta página" />
        <KpiTile icon="ban" tone="gray" value={res.data ? items.length - activas : '–'} label="Canceladas en esta página" />
      </section>

      <FiltroReservas clientes={ref.data?.clientes ?? []} applied={filtro} onApply={(f) => { setFiltro(f); setPage(1); }} />

      <DataTable
        columns={columns} rows={items} rowKey={(r) => r.id} loading={res.loading && !res.data}
        empty={<EmptyState icon="calendar" title="No hay reservas" text="Probá con otros filtros o ampliá el rango de fechas." />}
        footer={res.data && res.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={res.data.total} onPage={setPage} noun="reservas" />}
      />

      <div className="page-head" style={{ marginTop: 32 }}>
        <div><h2>Ranking (modelo de lectura CQRS)</h2><p>Clientes con más reservas activas. Vista derivada de los eventos; puede demorar unos segundos en reflejar un cambio.</p></div>
      </div>
      <DataTable
        columns={rankingColumns} rows={ranking.data?.items ?? []} rowKey={(c) => c.clienteId} loading={ranking.loading && !ranking.data}
        empty={<EmptyState icon="calendar" title="Sin datos proyectados todavía" text="El modelo de lectura se completa a medida que llegan eventos de reservas." />}
      />

      {aCancelar && (
        <ConfirmModal
          title="¿Cancelar esta reserva?"
          text={<>Se cancelará la reserva de {clientes.get(aCancelar.clienteId)?.nombre ?? 'el cliente'} del {fmtCorto(aCancelar.inicio)}.</>}
          confirmLabel="Sí, cancelar" busy={busy} onConfirm={cancelar} onClose={() => setACancelar(null)}
        />
      )}
    </>
  );
}
