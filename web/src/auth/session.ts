import { decodeJwt, type JwtClaims } from './jwt';

// Sesion: token en memoria + sessionStorage (sobrevive a recargas de la pestana).
const KEY = 'sp.token';
const KEY_EMAIL = 'sp.email';

export interface Session { token: string; claims: JwtClaims; email?: string }

let current: Session | null = null;
const listeners = new Set<() => void>();

function load(): Session | null {
  try {
    const token = sessionStorage.getItem(KEY);
    if (!token) return null;
    const claims = decodeJwt(token);
    if (!claims || claims.exp * 1000 <= Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return { token, claims, email: sessionStorage.getItem(KEY_EMAIL) ?? undefined };
  } catch {
    return null;
  }
}
current = load();

export const getSession = () => current;
export const getToken = () => current?.token ?? null;

export function setSession(token: string, email?: string): Session | null {
  const claims = decodeJwt(token);
  if (!claims) return null;
  current = { token, claims, email };
  try {
    sessionStorage.setItem(KEY, token);
    if (email) sessionStorage.setItem(KEY_EMAIL, email);
  } catch { /* storage no disponible */ }
  listeners.forEach((l) => l());
  return current;
}

export function clearSession() {
  current = null;
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY_EMAIL);
  } catch { /* noop */ }
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
