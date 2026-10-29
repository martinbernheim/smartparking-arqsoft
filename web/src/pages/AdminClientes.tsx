import { useState } from 'react';
import { ApiError, reportError } from '../api/client';
import { api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { toast } from '../components/toastBus';
import { Alert, Avatar, ConfirmModal, DataTable, EmptyState, FormField, Modal, Pagination, type Column } from '../components/ui';
import { iniciales } from '../format';
import { useAsync } from '../hooks/useAsync';
import type { ClienteDTO } from '../types';

const PAGE_SIZE = 10;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

function ClienteDrawer({ cliente, onClose, onSaved }: { cliente: ClienteDTO | null; onClose: () => void; onSaved: () => void }) {
  const editando = !!cliente;
  const [nombre, setNombre] = useState(cliente?.nombre ?? '');
  const [email, setEmail] = useState(cliente?.email ?? '');
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '');
  const [password, setPassword] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [errGlobal, setErrGlobal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const guardar = async () => {
    setErrGlobal(null);
    const fe: Record<string, string> = {};
    if (!nombre.trim()) fe.nombre = 'Ingresá el nombre.';
    if (!editando) {
      if (!EMAIL_RE.test(email.trim())) fe.email = 'Ingresá un email válido.';
      if (password.length < 8) fe.password = 'La contraseña debe tener al menos 8 caracteres.';
    }
    setErrs(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      if (cliente) await api.actualizarCliente(cliente.id, { nombre: nombre.trim(), telefono: telefono.trim() || null });
      else await api.crearCliente({ nombre: nombre.trim(), email: email.trim(), telefono: telefono.trim() || undefined, password });
      toast.success(editando ? 'Cliente actualizado' : 'Cliente creado');
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
      drawer
      title={editando ? 'Editar cliente' : 'Nuevo cliente'}
      subtitle={editando ? 'El email es el usuario de acceso y no se puede modificar.' : 'Se creará también su usuario de acceso con la contraseña inicial.'}
      onClose={onClose}
      onSubmit={guardar}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear cliente'}</button>
      </>}
    >
      <div className="stack">
        {errGlobal && <Alert>{errGlobal}</Alert>}
        <FormField label="Nombre completo" htmlFor="c-nombre" error={errs.nombre}>
          <input className={`input${errs.nombre ? ' is-invalid' : ''}`} id="c-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </FormField>
        <FormField label="Email" htmlFor="c-email" error={errs.email}>
          <input className={`input${errs.email ? ' is-invalid' : ''}`} id="c-email" type="email" value={email} disabled={editando} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Teléfono (opcional)" htmlFor="c-tel" error={errs.telefono}>
          <input className={`input${errs.telefono ? ' is-invalid' : ''}`} id="c-tel" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </FormField>
        {!editando && (
          <FormField label="Contraseña inicial" htmlFor="c-pass" error={errs.password} hint="Mínimo 8 caracteres. El cliente podrá usarla para ingresar.">
            <input className={`input${errs.password ? ' is-invalid' : ''}`} id="c-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
        )}
      </div>
    </Modal>
  );
}

export default function AdminClientes() {
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useAsync(() => api.clientes(page, PAGE_SIZE), [page]);
  const [editor, setEditor] = useState<{ c: ClienteDTO | null } | null>(null);
  const [aBorrar, setABorrar] = useState<ClienteDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const borrar = async () => {
    if (!aBorrar) return;
    setBusy(true);
    try {
      await api.eliminarCliente(aBorrar.id);
      toast.success('Cliente eliminado');
      if (data && data.items.length === 1 && page > 1) setPage(page - 1); else reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) toast.error('No se puede eliminar', e.message);
      else reportError(e, 'No se pudo eliminar el cliente.');
    } finally {
      setBusy(false);
      setABorrar(null);
    }
  };

  const columns: Column<ClienteDTO>[] = [
    { key: 'n', header: 'Cliente', cell: (c) => <div className="cell-user"><Avatar text={iniciales(c.nombre)} small /><strong>{c.nombre}</strong></div> },
    { key: 'e', header: 'Email', cell: (c) => c.email },
    { key: 't', header: 'Teléfono', cell: (c) => c.telefono ?? <span className="muted">—</span> },
    {
      key: 'a', header: 'Acciones', className: 'actions', cell: (c) => (
        <div className="row-actions">
          <button className="btn btn-ghost btn-icon" title="Editar" aria-label={`Editar ${c.nombre}`} onClick={() => setEditor({ c })}><Icon name="pencil" /></button>
          <button className="btn btn-danger btn-icon" title="Eliminar" aria-label={`Eliminar ${c.nombre}`} onClick={() => setABorrar(c)}><Icon name="trash" /></button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div><h1>Clientes</h1><p>Alta, edición y baja de clientes del sistema.</p></div>
        <button className="btn btn-primary" onClick={() => setEditor({ c: null })}><Icon name="plus" /> Nuevo cliente</button>
      </div>

      <DataTable
        columns={columns} rows={data?.items ?? []} rowKey={(c) => c.id} loading={loading && !data}
        empty={<EmptyState icon="users" title="Aún no hay clientes" text="Creá el primer cliente para que pueda ingresar y reservar."
          action={<button className="btn btn-primary" onClick={() => setEditor({ c: null })}><Icon name="plus" /> Nuevo cliente</button>} />}
        footer={data && data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} noun="clientes" />}
      />

      {editor && <ClienteDrawer cliente={editor.c} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); reload(); }} />}
      {aBorrar && (
        <ConfirmModal title="¿Eliminar cliente?" text={<>Vas a eliminar a <strong>{aBorrar.nombre}</strong> y su acceso. Si tiene reservas activas, no se podrá eliminar.</>}
          confirmLabel="Eliminar" busy={busy} onConfirm={borrar} onClose={() => setABorrar(null)} backLabel="Cancelar" />
      )}
    </>
  );
}
