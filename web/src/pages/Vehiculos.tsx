import { useState } from 'react';
import { ApiError, reportError } from '../api/client';
import { api } from '../api/endpoints';
import { VehiculoCard } from '../components/cards';
import { Icon } from '../components/Icon';
import { toast } from '../components/toastBus';
import { Alert, ConfirmModal, EmptyState, FormField, Modal, Skeleton } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import type { VehiculoDTO } from '../types';

function VehiculoModal({ vehiculo, onClose, onSaved }: { vehiculo: VehiculoDTO | null; onClose: () => void; onSaved: () => void }) {
  const [matricula, setMatricula] = useState(vehiculo?.matricula ?? '');
  const [marca, setMarca] = useState(vehiculo?.marca ?? '');
  const [modelo, setModelo] = useState(vehiculo?.modelo ?? '');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [errGlobal, setErrGlobal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const guardar = async () => {
    setErrGlobal(null);
    const fe: Record<string, string> = {};
    if (!matricula.trim()) fe.matricula = 'Ingresá la matrícula.';
    setErrs(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      if (vehiculo) {
        await api.actualizarVehiculo(vehiculo.id, { matricula: matricula.trim(), marca: marca.trim() || null, modelo: modelo.trim() || null });
      } else {
        await api.crearVehiculo({ matricula: matricula.trim(), marca: marca.trim() || undefined, modelo: modelo.trim() || undefined });
      }
      toast.success(vehiculo ? 'Vehículo actualizado' : 'Vehículo agregado');
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        const f = e.fieldErrors();
        setErrs(f);
        if (!Object.keys(f).length) setErrGlobal(e.message);
      } else if (e instanceof ApiError && (e.status === 409 || e.status === 404)) setErrGlobal(e.message);
      else reportError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={vehiculo ? 'Editar vehículo' : 'Agregar vehículo'}
      subtitle="Los datos se usan para identificar tus reservas."
      onClose={onClose}
      onSubmit={guardar}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : vehiculo ? 'Guardar cambios' : 'Agregar vehículo'}</button>
      </>}
    >
      <div className="form-grid">
        {errGlobal && <div className="full"><Alert>{errGlobal}</Alert></div>}
        <FormField className="full" label="Matrícula" htmlFor="v-mat" error={errs.matricula}>
          <input className={`input${errs.matricula ? ' is-invalid' : ''}`} id="v-mat" value={matricula} placeholder="SBA 1234" autoComplete="off"
            onChange={(e) => setMatricula(e.target.value.toUpperCase())} />
        </FormField>
        <FormField label="Marca" htmlFor="v-marca" error={errs.marca}>
          <input className={`input${errs.marca ? ' is-invalid' : ''}`} id="v-marca" value={marca} placeholder="Toyota" onChange={(e) => setMarca(e.target.value)} />
        </FormField>
        <FormField label="Modelo" htmlFor="v-modelo" error={errs.modelo}>
          <input className={`input${errs.modelo ? ' is-invalid' : ''}`} id="v-modelo" value={modelo} placeholder="Corolla" onChange={(e) => setModelo(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}

export default function Vehiculos() {
  const { data, loading, error, reload } = useAsync(() => api.vehiculos(), []);
  const [editor, setEditor] = useState<{ v: VehiculoDTO | null } | null>(null);
  const [aBorrar, setABorrar] = useState<VehiculoDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const borrar = async () => {
    if (!aBorrar) return;
    setBusy(true);
    try {
      await api.eliminarVehiculo(aBorrar.id);
      toast.success('Vehículo eliminado');
      setABorrar(null);
      reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) toast.error('No se puede eliminar', e.message);
      else reportError(e, 'No se pudo eliminar el vehículo.');
      setABorrar(null);
    } finally {
      setBusy(false);
    }
  };

  const nuevo = <button className="btn btn-primary" onClick={() => setEditor({ v: null })}><Icon name="plus" /> Agregar vehículo</button>;

  return (
    <>
      <div className="page-head">
        <div><h1>Mis vehículos</h1><p>Administrá los vehículos con los que hacés tus reservas.</p></div>
        {nuevo}
      </div>

      {loading && !data ? (
        <div className="vehiculos">{[0, 1, 2].map((i) => <div className="card vehiculo" key={i}><Skeleton h={52} w={132} /><Skeleton h={20} w="60%" /><Skeleton h={34} w="50%" /></div>)}</div>
      ) : error && !data ? (
        <EmptyState icon="alert" title="No pudimos cargar tus vehículos" text="Revisá tu conexión e intentá nuevamente." action={<button className="btn btn-secondary" onClick={reload}>Reintentar</button>} />
      ) : data && data.length === 0 ? (
        <EmptyState icon="car" title="Aún no tenés vehículos" text="Agregá tu primer vehículo para empezar a reservar." action={nuevo} />
      ) : (
        <div className="vehiculos">
          {data?.map((v) => <VehiculoCard key={v.id} vehiculo={v} onEdit={() => setEditor({ v })} onDelete={() => setABorrar(v)} />)}
        </div>
      )}

      {editor && <VehiculoModal vehiculo={editor.v} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); reload(); }} />}
      {aBorrar && (
        <ConfirmModal title="¿Eliminar vehículo?" text={<>Vas a eliminar <strong>{aBorrar.matricula}</strong>. Esta acción no se puede deshacer.</>}
          confirmLabel="Eliminar" busy={busy} onConfirm={borrar} onClose={() => setABorrar(null)} backLabel="Cancelar" />
      )}
    </>
  );
}
