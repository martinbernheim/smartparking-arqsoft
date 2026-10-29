import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, Outlet } from 'react-router-dom';
import { api } from '../api/endpoints';
import { homeFor, useAuth } from '../auth/AuthContext';
import { iniciales } from '../format';
import { Icon, type IconName } from './Icon';
import { Avatar, RolBadge } from './ui';

interface Item { to: string; label: string; icon: IconName }
const CLIENTE_NAV: Item[] = [
  { to: '/reservas', label: 'Mis reservas', icon: 'calendar' },
  { to: '/vehiculos', label: 'Mis vehículos', icon: 'car' },
];
const ADMIN_NAV: Item[] = [
  { to: '/admin/reservas', label: 'Reservas', icon: 'calendar' },
  { to: '/admin/clientes', label: 'Clientes', icon: 'users' },
];

export function Navbar() {
  const { session, rol, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rol !== 'CLIENTE') return;
    api.clienteMe().then((c) => setNombre(c.nombre), () => undefined);
  }, [rol]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  const display = nombre ?? (rol === 'ADMIN' ? 'Administrador' : 'Cliente');
  return (
    <header className="navbar">
      <Link className="brand" to={homeFor(rol)} aria-label="SmartParking, inicio">
        <img src="/logo-mark.svg" alt="" /><span>Smart<b>Parking</b></span>
      </Link>
      {rol && (
        <div className="user-menu" ref={ref}>
          <button className="user-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <Avatar text={iniciales(display)} small />
            <span className="who"><span>{display}</span><RolBadge rol={rol} /></span>
            <Icon name="chevron" small />
          </button>
          <div className={`dropdown${open ? ' is-open' : ''}`} role="menu">
            <div style={{ padding: '10px 12px 8px' }}>
              <strong style={{ display: 'block' }}>{display}</strong>
              <span className="small muted" style={{ wordBreak: 'break-all' }}>{session?.email}</span>
              <div style={{ marginTop: 8 }}><RolBadge rol={rol} /></div>
            </div>
            <button role="menuitem" onClick={logout}><Icon name="logout" /> Cerrar sesión</button>
          </div>
        </div>
      )}
    </header>
  );
}

export function Sidebar() {
  const { rol } = useAuth();
  const items = rol === 'ADMIN' ? ADMIN_NAV : CLIENTE_NAV;
  return (
    <nav className="sidebar" aria-label="Navegación principal">
      <p className="eyebrow">{rol === 'ADMIN' ? 'Administración' : 'Mi cuenta'}</p>
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} className="nav-link">
          <Icon name={i.icon} /> {i.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  return (
    <>
      <Navbar />
      <div className="shell">
        <Sidebar />
        <main className="main"><Outlet /></main>
      </div>
    </>
  );
}
