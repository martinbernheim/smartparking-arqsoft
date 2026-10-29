const fFecha = new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium' });
const fHora = new Intl.DateTimeFormat('es-UY', { hour: '2-digit', minute: '2-digit' });
const fCorto = new Intl.DateTimeFormat('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const fLargo = new Intl.DateTimeFormat('es-UY', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

export const fmtFecha = (iso: string) => fFecha.format(new Date(iso));
export const fmtHora = (iso: string) => fHora.format(new Date(iso));
export const fmtCorto = (iso: string) => fCorto.format(new Date(iso)).replace(',', '');
export const fmtLargo = (iso: string) => fLargo.format(new Date(iso));
export const fmtDiaHora = (iso: string) => `${fmtLargo(iso)} · ${fmtHora(iso)}`;

/** ISO -> valor de <input type="datetime-local"> en hora local. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (v: string) => new Date(v).toISOString();

export function duracion(ini: string, fin: string): string {
  const min = Math.round((new Date(fin).getTime() - new Date(ini).getTime()) / 60000);
  if (!Number.isFinite(min) || min <= 0) return '—';
  const h = Math.floor(min / 60), m = min % 60;
  if (h >= 24) { const d = Math.floor(h / 24); return `${d} d${h % 24 ? ` ${h % 24} h` : ''}`; }
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}

export const iniciales = (nombre: string) =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
