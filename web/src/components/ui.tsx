import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { EstadoReserva, Rol } from '../types';
import { Icon, type IconName } from './Icon';

export function EstadoBadge({ estado }: { estado: EstadoReserva }) {
  return estado === 'ACTIVA'
    ? <span className="badge badge-activa">Activa</span>
    : <span className="badge badge-cancelada">Cancelada</span>;
}

export function RolBadge({ rol }: { rol: Rol }) {
  return <span className={`badge badge-role ${rol === 'ADMIN' ? 'badge-admin' : 'badge-cliente'}`}>{rol === 'ADMIN' ? 'Admin' : 'Cliente'}</span>;
}

export function Plate({ matricula, small }: { matricula: string; small?: boolean }) {
  return (
    <span className={`plate${small ? ' plate-sm' : ''}`}>
      <span className="plate-top">URUGUAY</span>
      <span className="plate-num">{matricula}</span>
    </span>
  );
}

export function Avatar({ text, small }: { text: string; small?: boolean }) {
  return <span className={`avatar${small ? ' avatar-sm' : ''}`} aria-hidden="true">{text}</span>;
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="card empty">
      <div className="empty-art"><Icon name={icon} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function FormField({ label, htmlFor, error, hint, className = '', children }: {
  label: string; htmlFor: string; error?: string; hint?: string; className?: string; children: ReactNode;
}) {
  return (
    <div className={`field ${className}`}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error
        ? <p className="error-text" id={`${htmlFor}-err`}><Icon name="alert" small /> {error}</p>
        : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function KpiTile({ icon, tone, value, label }: { icon: IconName; tone: 'blue' | 'violet' | 'gray'; value: ReactNode; label: string }) {
  return (
    <div className="card kpi">
      <span className={`kpi-icon ${tone}`}><Icon name={icon} /></span>
      <div><div className="kpi-value">{value}</div><div className="kpi-label">{label}</div></div>
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return <div className="alert alert-error" role="alert"><Icon name="alert" /><div>{children}</div></div>;
}

export function Skeleton({ h = 16, w = '100%', r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function SkeletonCards({ n = 3 }: { n?: number }) {
  return (
    <div className="reserva-list" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: n }, (_, i) => (
        <div className="card reserva" key={i}>
          <Skeleton h={52} w={132} r={8} />
          <div style={{ display: 'grid', gap: 10 }}><Skeleton h={18} w="40%" /><Skeleton h={14} w="70%" /></div>
          <Skeleton h={34} w={96} />
        </div>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage, noun }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; noun: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, Math.max(1, page - 2) + 4); p++) nums.push(p);
  return (
    <div className="pagination">
      <span>Mostrando {from}–{to} de {total} {noun}</span>
      <nav className="pager" aria-label="Paginación">
        <button disabled={page <= 1} aria-label="Anterior" onClick={() => onPage(page - 1)}><Icon name="left" small /></button>
        {nums.map((p) => (
          <button key={p} aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{p}</button>
        ))}
        <button disabled={page >= pages} aria-label="Siguiente" onClick={() => onPage(page + 1)}><Icon name="right" small /></button>
      </nav>
    </div>
  );
}

export interface Column<T> { key: string; header: ReactNode; className?: string; cell: (row: T) => ReactNode }

export function DataTable<T>({ columns, rows, rowKey, loading, empty, footer }: {
  columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; loading?: boolean; empty?: ReactNode; footer?: ReactNode;
}) {
  return (
    <section className="card card-flush">
      <div className="table-wrap">
        <table className="table">
          <thead><tr>{columns.map((c) => <th key={c.key} className={c.className}>{c.header}</th>)}</tr></thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>{columns.map((c) => <td key={c.key}><Skeleton h={16} w="80%" /></td>)}</tr>
              ))
              : rows.map((r) => (
                <tr key={rowKey(r)}>{columns.map((c) => <td key={c.key} className={c.className}>{c.cell(r)}</td>)}</tr>
              ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 && empty}
      {footer}
    </section>
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Modal centrado (o drawer lateral con `drawer`). Maneja Esc, foco y aria-modal. */
export function Modal({ title, subtitle, onClose, children, footer, drawer, onSubmit }: {
  title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; drawer?: boolean; onSubmit?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input,select,textarea') ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && ref.current) {
        const els = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!els.length) return;
        const a = els[0]!, z = els[els.length - 1]!;
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const ov = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ov; prev?.focus(); };
  }, [onClose]);

  const Tag = onSubmit ? 'form' : 'div';
  return (
    <div className={`overlay is-open${drawer ? ' drawer-wrap' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} style={drawer ? { height: '100%', maxWidth: 460, width: '100%' } : { width: '100%', maxWidth: 520 }}>
        <Tag
          className={drawer ? 'drawer' : 'modal'}
          {...(onSubmit ? { onSubmit: (e: React.FormEvent) => { e.preventDefault(); onSubmit(); }, noValidate: true } : {})}
        >
          <div className="modal-head">
            <div><h2 id={titleId}>{title}</h2>{subtitle && <p className="muted small" style={{ marginTop: 4 }}>{subtitle}</p>}</div>
            <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </Tag>
      </div>
    </div>
  );
}

export function ConfirmModal({ title, text, confirmLabel, busy, onConfirm, onClose, backLabel = 'Volver' }: {
  title: string; text: ReactNode; confirmLabel: string; busy?: boolean; onConfirm: () => void; onClose: () => void; backLabel?: string;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{backLabel}</button>
        <button type="button" className="btn btn-danger-solid" onClick={onConfirm} disabled={busy}>{busy ? 'Procesando…' : confirmLabel}</button>
      </>}
    >
      <p className="muted">{text}</p>
    </Modal>
  );
}
