import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, reportError } from '../api/client';
import { api } from '../api/endpoints';
import { homeFor, useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { toast } from '../components/toastBus';
import { Alert, EmptyState, FormField, Plate, Skeleton } from '../components/ui';
import { duracion, fmtDiaHora, fromLocalInput, toLocalInput } from '../format';
import { useAsync } from '../hooks/useAsync';

const ahoraLocal = (offsetH = 0) => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1 + offsetH);
  return toLocalInput(d.toISOString());
};

export default function ReservaForm() {
  const { id } = useParams();
  const editando = !!id;
  const { rol } = useAuth();
  const navigate = useNavigate();
  const volver = homeFor(rol);

  const { data, loading } = useAsync(async () => {
    const [vehiculos, reserva] = await Promise.all([api.vehiculos(), id ? api.reserva(id) : Promise.resolve(null)]);
    return { vehiculos, reserva };
  }, [id]);

  const [vehiculoId, setVehiculoId] = useState('');
  const [inicio, setInicio] = useState(ahoraLocal());
  const [fin, setFin] = useState(ahoraLocal(2));
  const [busy, setBusy] = useState(false);
  const [errGlobal, setErrGlobal] = useState<string | null>(null);
  const [errSolape, setErrSolape] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    if (data.reserva) {
      setVehiculoId(data.reserva.vehiculoId);
      setInicio(toLocalInput(data.reserva.inicio));
      setFin(toLocalInput(data.reserva.fin));
    } else if (data.vehiculos[0]) {
      setVehiculoId((v) => v || data.vehiculos[0]!.id);
    }
  }, [data]);

  const vehiculo = data?.vehiculos.find((v) => v.id === vehiculoId);
  const valido = !!inicio && !!fin && new Date(fin) > new Date(inicio);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrGlobal(null); setErrSolape(null);
    const fe: Record<string, string> = {};
    if (!vehiculoId) fe.vehiculoId = 'Elegí un vehículo.';
    if (!inicio) fe.inicio = 'Indicá la fecha de inicio.';
    if (!fin) fe.fin = 'Indicá la fecha de fin.';
    else if (inicio && new Date(fin) <= new Date(inicio)) fe.fin = 'La fecha de fin debe ser posterior a la de inicio.';
    setErrs(fe);
    if (Object.keys(fe).length) return;

    setBusy(true);
    try {
      const body = { inicio: fromLocalInput(inicio), fin: fromLocalInput(fin) };
      if (editando) await api.actualizarReserva(id!, body);
      else await api.crearReserva({ vehiculoId, ...body });
      toast.success(editando ? 'Reserva actualizada' : 'Reserva creada', 'Los cambios ya están guardados.');
      navigate(volver);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrSolape(err.message || 'El vehículo ya tiene una reserva activa en ese horario');
      else if (err instanceof ApiError && err.status === 400) {
        const f = err.fieldErrors();
        setErrs(f);
        if (!Object.keys(f).length) setErrGlobal(err.message);
      } else if (err instanceof ApiError && err.status === 404) setErrGlobal('No se encontró el vehículo o la reserva.');
      else reportError(err);
    } finally {
      setBusy(false);
    }
  };

  const titulo = editando ? 'Modificar reserva' : 'Nueva reserva';
  const sinVehiculos = !loading && data && data.vehiculos.length === 0 && !editando;
  const noEditable = data?.reserva && data.reserva.estado !== 'ACTIVA';

  return (
    <>
      <p className="small" style={{ marginBottom: 'var(--s-3)' }}>
        <Link to={volver} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="left" small /> Volver a {rol === 'ADMIN' ? 'reservas' : 'mis reservas'}</Link>
      </p>
      <div className="page-head"><div><h1>{titulo}</h1><p>{editando ? 'Ajustá el horario de tu estacionamiento.' : 'Elegí el vehículo y el horario de tu estacionamiento.'}</p></div></div>

      {loading ? (
        <div className="card" style={{ display: 'grid', gap: 16 }}><Skeleton h={44} /><Skeleton h={44} /><Skeleton h={44} /></div>
      ) : sinVehiculos ? (
        <EmptyState icon="car" title="Primero registrá un vehículo" text="Necesitás al menos un vehículo para poder reservar."
          action={<Link className="btn btn-primary" to="/vehiculos"><Icon name="plus" /> Agregar vehículo</Link>} />
      ) : noEditable ? (
        <EmptyState icon="ban" title="Esta reserva está cancelada" text="Las reservas canceladas no se pueden modificar." action={<Link className="btn btn-secondary" to={volver}>Volver</Link>} />
      ) : (
        <div className="split">
          <form className="card" onSubmit={submit} noValidate>
            {errGlobal && <div style={{ marginBottom: 'var(--s-5)' }}><Alert>{errGlobal}</Alert></div>}
            {errSolape && (
              <div style={{ marginBottom: 'var(--s-5)' }}>
                <Alert>No se pudo {editando ? 'modificar' : 'crear'} la reserva. <span style={{ fontWeight: 500 }}>{errSolape}</span></Alert>
              </div>
            )}
            <div className="form-grid">
              <FormField className="full" label="Vehículo" htmlFor="veh" error={errs.vehiculoId} hint={editando ? 'El vehículo no se puede cambiar; cancelá y creá otra reserva.' : undefined}>
                <select className={`select${errs.vehiculoId ? ' is-invalid' : ''}`} id="veh" value={vehiculoId} disabled={editando} onChange={(e) => setVehiculoId(e.target.value)}>
                  {data?.vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>{v.matricula}{v.marca || v.modelo ? ` · ${[v.marca, v.modelo].filter(Boolean).join(' ')}` : ''}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Inicio" htmlFor="ini" error={errs.inicio}>
                <input className={`input${errs.inicio || errSolape ? ' is-invalid' : ''}`} id="ini" type="datetime-local" value={inicio}
                  onChange={(e) => { setInicio(e.target.value); setErrSolape(null); }} aria-invalid={!!(errs.inicio || errSolape)} />
              </FormField>
              <FormField label="Fin" htmlFor="fin" error={errs.fin}>
                <input className={`input${errs.fin || errSolape ? ' is-invalid' : ''}`} id="fin" type="datetime-local" value={fin} min={inicio}
                  onChange={(e) => { setFin(e.target.value); setErrSolape(null); }} aria-invalid={!!(errs.fin || errSolape)} />
              </FormField>
              {errSolape && (
                <div className="full"><p className="error-text" role="alert"><Icon name="alert" small /> {errSolape}</p></div>
              )}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s-6)', flexWrap: 'wrap' }}>
              <Link className="btn btn-secondary" to={volver}>Cancelar</Link>
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : editando ? 'Guardar cambios' : 'Confirmar reserva'}</button>
            </div>
          </form>

          <aside className="card summary" style={{ background: 'var(--grad-soft)' }}>
            <p className="eyebrow" style={{ marginBottom: 'var(--s-4)' }}>Resumen</p>
            <div style={{ marginBottom: 'var(--s-4)' }}><Plate matricula={vehiculo?.matricula ?? '—'} /></div>
            <dl>
              <div><dt>Vehículo</dt><dd>{[vehiculo?.marca, vehiculo?.modelo].filter(Boolean).join(' ') || '—'}</dd></div>
              <div><dt>Inicio</dt><dd>{inicio ? fmtDiaHora(fromLocalInput(inicio)) : '—'}</dd></div>
              <div><dt>Fin</dt><dd>{fin ? fmtDiaHora(fromLocalInput(fin)) : '—'}</dd></div>
              <div><dt>Duración</dt><dd>{valido ? duracion(fromLocalInput(inicio), fromLocalInput(fin)) : '—'}</dd></div>
            </dl>
            <p className="alert alert-info" style={{ marginTop: 'var(--s-5)', fontWeight: 500 }}>
              <Icon name="clock" /><span>Podés modificar o cancelar la reserva mientras esté activa.</span>
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
