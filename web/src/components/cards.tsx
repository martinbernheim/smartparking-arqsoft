import { useState } from 'react';
import { Link } from 'react-router-dom';
import { duracion, fmtDiaHora } from '../format';
import type { ClienteDTO, EstadoReserva, ReservaDTO, VehiculoDTO } from '../types';
import { Icon } from './Icon';
import { EstadoBadge, Plate } from './ui';

export function ReservaCard({ reserva, vehiculo, onCancel }: { reserva: ReservaDTO; vehiculo?: VehiculoDTO; onCancel: (r: ReservaDTO) => void }) {
  const activa = reserva.estado === 'ACTIVA';
  const desc = [vehiculo?.marca, vehiculo?.modelo].filter(Boolean).join(' ');
  return (
    <article className={`card reserva${activa ? '' : ' is-cancelada'}`}>
      <Plate matricula={vehiculo?.matricula ?? '—'} />
      <div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <strong>{desc || 'Vehículo'}</strong>
          <EstadoBadge estado={reserva.estado} />
        </div>
        <dl className="reserva-when">
          <div><dt>Inicio</dt><dd>{fmtDiaHora(reserva.inicio)}</dd></div>
          <div><dt>Fin</dt><dd>{fmtDiaHora(reserva.fin)}</dd></div>
          <div><dt>Duración</dt><dd>{duracion(reserva.inicio, reserva.fin)}</dd></div>
        </dl>
      </div>
      {activa && (
        <div className="reserva-actions">
          <Link className="btn btn-secondary btn-sm" to={`/reservas/${reserva.id}/editar`}><Icon name="pencil" small /> Modificar</Link>
          <button className="btn btn-danger btn-sm" onClick={() => onCancel(reserva)}>Cancelar</button>
        </div>
      )}
    </article>
  );
}

export function VehiculoCard({ vehiculo, onEdit, onDelete }: { vehiculo: VehiculoDTO; onEdit: () => void; onDelete: () => void }) {
  const desc = [vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ');
  return (
    <article className="card vehiculo card-hover">
      <Plate matricula={vehiculo.matricula} />
      <div>
        <h3>{desc || 'Sin marca ni modelo'}</h3>
        {!desc && <p className="small muted">Agregá marca y modelo editando el vehículo.</p>}
      </div>
      <div className="row" style={{ marginTop: 'auto' }}>
        <button className="btn btn-secondary btn-sm" onClick={onEdit}><Icon name="pencil" small /> Editar</button>
        <button className="btn btn-danger btn-sm" onClick={onDelete}><Icon name="trash" small /> Eliminar</button>
      </div>
    </article>
  );
}

export type EstadoFiltro = EstadoReserva | 'TODAS';

export function FiltroChips({ value, onChange, counts }: { value: EstadoFiltro; onChange: (v: EstadoFiltro) => void; counts: Record<EstadoFiltro, number> }) {
  const opts: [EstadoFiltro, string][] = [['TODAS', 'Todas'], ['ACTIVA', 'Activas'], ['CANCELADA', 'Canceladas']];
  return (
    <div className="chips" role="group" aria-label="Filtrar por estado">
      {opts.map(([v, label]) => (
        <button key={v} className="chip" aria-pressed={value === v} onClick={() => onChange(v)}>
          {label} <span className="count">{counts[v]}</span>
        </button>
      ))}
    </div>
  );
}

export interface FiltroAdmin { clienteId: string; estado: '' | EstadoReserva; desde: string; hasta: string }
export const FILTRO_VACIO: FiltroAdmin = { clienteId: '', estado: '', desde: '', hasta: '' };

export function FiltroReservas({ clientes, applied, onApply }: { clientes: ClienteDTO[]; applied: FiltroAdmin; onApply: (f: FiltroAdmin) => void }) {
  const [f, setF] = useState<FiltroAdmin>(applied);
  const set = <K extends keyof FiltroAdmin>(k: K, v: FiltroAdmin[K]) => setF((x) => ({ ...x, [k]: v }));
  const rangoInvalido = !!f.desde && !!f.hasta && f.hasta < f.desde;
  return (
    <form
      className="card filters"
      aria-label="Filtros de reservas"
      onSubmit={(e) => { e.preventDefault(); if (!rangoInvalido) onApply(f); }}
      onReset={(e) => { e.preventDefault(); setF(FILTRO_VACIO); onApply(FILTRO_VACIO); }}
    >
      <div className="field">
        <label className="label" htmlFor="f-cli">Cliente</label>
        <select className="select" id="f-cli" value={f.clienteId} onChange={(e) => set('clienteId', e.target.value)}>
          <option value="">Todos los clientes</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="f-est">Estado</label>
        <select className="select" id="f-est" value={f.estado} onChange={(e) => set('estado', e.target.value as FiltroAdmin['estado'])}>
          <option value="">Todos</option><option value="ACTIVA">Activa</option><option value="CANCELADA">Cancelada</option>
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="f-des">Desde</label>
        <input className="input" id="f-des" type="date" value={f.desde} onChange={(e) => set('desde', e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="f-has">Hasta</label>
        <input className={`input${rangoInvalido ? ' is-invalid' : ''}`} id="f-has" type="date" value={f.hasta} onChange={(e) => set('hasta', e.target.value)} />
      </div>
      <div className="row btns">
        <button className="btn btn-primary" type="submit" disabled={rangoInvalido}><Icon name="search" /> Filtrar</button>
        <button className="btn btn-ghost" type="reset">Limpiar</button>
      </div>
      {rangoInvalido && <p className="error-text full-row"><Icon name="alert" small /> La fecha “hasta” no puede ser anterior a “desde”.</p>}
    </form>
  );
}
