import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/endpoints';
import { toast } from '../components/toastBus';
import type { Rol } from '../types';
import { clearSession, getSession, setSession, subscribe, type Session } from './session';

interface AuthValue {
  session: Session | null;
  rol: Rol | null;
  login: (email: string, password: string) => Promise<Rol>;
  logout: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

export const homeFor = (rol: Rol | null) => (rol === 'ADMIN' ? '/admin/reservas' : '/reservas');
export const rolOf = (s: Session | null): Rol | null => (s ? (s.claims.roles.includes('ADMIN') ? 'ADMIN' : s.claims.roles.includes('CLIENTE') ? 'CLIENTE' : null) : null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribe, getSession);
  const navigate = useNavigate();
  const rol = rolOf(session);

  // Auto-logout al vencer el token; cualquier cierre de sesion (401 incluido) lleva a /login.
  useEffect(() => {
    if (!session) return;
    const ms = session.claims.exp * 1000 - Date.now();
    if (ms <= 0) { clearSession(); return; }
    const t = window.setTimeout(() => {
      clearSession();
      toast.error('Sesión vencida', 'Volvé a ingresar para continuar.');
    }, Math.min(ms, 2 ** 31 - 1));
    return () => window.clearTimeout(t);
  }, [session]);

  const wasLogged = useMemo(() => ({ v: false }), []);
  useEffect(() => {
    if (session) wasLogged.v = true;
    else if (wasLogged.v) { wasLogged.v = false; navigate('/login', { replace: true }); }
  }, [session, navigate, wasLogged]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    const s = setSession(res.accessToken, email);
    const r = rolOf(s);
    if (!r) { clearSession(); throw new Error('Token inválido'); }
    return r;
  }, []);

  const value = useMemo<AuthValue>(() => ({ session, rol, login, logout: clearSession }), [session, rol, login]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuera de AuthProvider');
  return v;
}
