import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, homeFor, useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { ToastHost } from './components/Toast';
import { EmptyState } from './components/ui';
import type { Rol } from './types';
import AdminClientes from './pages/AdminClientes';
import AdminReservas from './pages/AdminReservas';
import Login from './pages/Login';
import MisReservas from './pages/MisReservas';
import ReservaForm from './pages/ReservaForm';
import Vehiculos from './pages/Vehiculos';

function Guard({ rol }: { rol?: Rol }) {
  const auth = useAuth();
  if (!auth.rol) return <Navigate to="/login" replace />;
  if (rol && auth.rol !== rol) return <Navigate to={homeFor(auth.rol)} replace />;
  return <Outlet />;
}

function Home() {
  const { rol } = useAuth();
  return <Navigate to={rol ? homeFor(rol) : '/login'} replace />;
}

function NotFound() {
  return (
    <EmptyState icon="search" title="Página no encontrada" text="La dirección que buscás no existe o fue movida."
      action={<Link className="btn btn-primary" to="/">Ir al inicio</Link>} />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />
        <Route element={<Guard />}>
          <Route element={<AppShell />}>
            <Route element={<Guard rol="CLIENTE" />}>
              <Route path="/reservas" element={<MisReservas />} />
              <Route path="/reservas/nueva" element={<ReservaForm />} />
              <Route path="/vehiculos" element={<Vehiculos />} />
            </Route>
            <Route path="/reservas/:id/editar" element={<ReservaForm />} />
            <Route element={<Guard rol="ADMIN" />}>
              <Route path="/admin/reservas" element={<AdminReservas />} />
              <Route path="/admin/clientes" element={<AdminClientes />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
      <ToastHost />
    </AuthProvider>
  );
}
