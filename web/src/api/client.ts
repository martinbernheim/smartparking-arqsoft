// Capa unica de acceso HTTP. Para reconciliar rutas con la API, ajustar PATHS y los metodos de endpoints.ts.
import { clearSession, getToken } from '../auth/session';
import { toast } from '../components/toastBus';

export const PATHS = {
  login: '/auth/login',
  clienteMe: '/api/clientes/me',
  clientes: '/api/clientes',
  vehiculos: '/api/vehiculos',
  reservas: '/api/reservas',
  reservasMias: '/api/reservas/mias',
  reservaCancelar: (id: string) => `/api/reservas/${id}/cancelar`,
  adminReservas: '/api/admin/reservas',
} as const;

export interface FieldIssue { path: (string | number)[]; message: string }

export class ApiError extends Error {
  status: number;
  issues: FieldIssue[];
  handled: boolean;
  constructor(status: number, message: string, issues: FieldIssue[] = [], handled = false) {
    super(message);
    this.status = status;
    this.issues = issues;
    this.handled = handled;
  }
  /** Errores de validacion (400 zod) como { campo: mensaje }. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const i of this.issues) {
      const k = String(i.path[i.path.length - 1] ?? '');
      if (k && !out[k]) out[k] = traducir(i.message);
    }
    return out;
  }
}

function traducir(m: string): string {
  if (/invalid email/i.test(m)) return 'Ingresá un email válido.';
  if (/required/i.test(m)) return 'Este campo es obligatorio.';
  const min = /at least (\d+)/i.exec(m);
  if (min) return `Debe tener al menos ${min[1]} caracteres.`;
  if (/fin debe ser posterior/i.test(m)) return 'La fecha de fin debe ser posterior a la de inicio.';
  if (/invalid datetime/i.test(m)) return 'Fecha y hora inválidas.';
  return m;
}

type Query = Record<string, string | number | undefined | null>;
interface Opts { body?: unknown; query?: Query; auth?: boolean }

async function realRequest<T>(method: string, path: string, opts: Opts = {}): Promise<T> {
  const { body, query, auth = true } = opts;
  const params = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
  }
  const qs = params.toString();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path + (qs ? `?${qs}` : ''), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    toast.error('Sin conexión', 'No se pudo contactar al servidor. Reintentá en unos segundos.');
    throw new ApiError(0, 'Sin conexión', [], true);
  }
  if (res.status === 204) return undefined as T;
  let data: any = null;
  try { data = await res.json(); } catch { /* cuerpo vacío */ }
  if (res.ok) return data as T;

  const msg: string = data?.error || data?.message || `Error ${res.status}`;
  if (res.status === 401 && auth) {
    clearSession(); // AuthProvider redirige a /login
    throw new ApiError(401, 'Sesión expirada', [], true);
  }
  if (res.status === 403) {
    toast.error('Acción no permitida', 'No tenés permisos para realizar esta acción.');
    throw new ApiError(403, msg, [], true);
  }
  if (res.status >= 500) {
    toast.error('Error del servidor', 'Algo salió mal de nuestro lado. Intentá de nuevo más tarde.');
    throw new ApiError(res.status, msg, [], true);
  }
  throw new ApiError(res.status, msg, Array.isArray(data?.details) ? data.details : []);
}

async function request<T>(method: string, path: string, opts: Opts = {}): Promise<T> {
  if (import.meta.env.VITE_MOCK === '1') {
    const { mockRequest } = await import('./mock');
    return mockRequest<T>(method, path, opts);
  }
  return realRequest<T>(method, path, opts);
}

export const http = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown, auth = true) => request<T>('POST', path, { body: body ?? {}, auth }),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, { body }),
  del: <T = void>(path: string) => request<T>('DELETE', path),
};

/** Muestra un toast para errores no manejados en el sitio de llamada. */
export function reportError(e: unknown, fallback = 'No se pudo completar la acción.') {
  if (e instanceof ApiError) {
    if (!e.handled) toast.error(e.message || fallback);
  } else {
    toast.error(fallback);
  }
}
