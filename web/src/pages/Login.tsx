import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { homeFor, useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { toast } from '../components/toastBus';
import { Alert } from '../components/ui';

export default function Login() {
  const { rol, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<{ email?: string; password?: string }>({});

  if (rol) return <Navigate to={homeFor(rol)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof fe = {};
    if (!email.trim()) errs.email = 'Ingresá tu email.';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = 'Ingresá un email válido.';
    if (!password) errs.password = 'Ingresá tu contraseña.';
    setFe(errs);
    setError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError('Email o contraseña incorrectos. Revisá tus datos e intentá de nuevo.');
      else if (err instanceof ApiError && err.status === 400) setError('Revisá el formato del email y la contraseña.');
      else if (!(err instanceof ApiError && err.handled)) toast.error('No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <section className="brand-panel" aria-label="SmartParking">
        <div className="bp-logo"><img src="/logo-mark-white.svg" alt="" /><span><span>Smart</span>Parking</span></div>
        <div className="bp-body">
          <h2>Reservá tu lugar, sin vueltas.</h2>
          <p>Gestioná tus vehículos y reservas de estacionamiento en un solo lugar, con disponibilidad en tiempo real.</p>
          <ul className="bp-list">
            <li><span className="ck"><Icon name="check" /></span> Reservas sin superposiciones por vehículo</li>
            <li><span className="ck"><Icon name="car" /></span> Todos tus vehículos, siempre a mano</li>
            <li><span className="ck"><Icon name="shield" /></span> Acceso seguro con roles Cliente y Admin</li>
          </ul>
        </div>
        <div className="bp-foot">© 2026 SmartParking · Arquitectura de Software</div>
      </section>

      <section className="form-side">
        <form className="login" onSubmit={submit} noValidate>
          <div className="mobile-logo"><img src="/logo-mark.svg" alt="" /><span>Smart<span className="text-grad">Parking</span></span></div>
          <h1>Bienvenido de nuevo</h1>
          <p className="muted" style={{ margin: '6px 0 26px' }}>Ingresá con tu email y contraseña para continuar.</p>

          {error && <div style={{ marginBottom: 20 }}><Alert>{error}</Alert></div>}

          <div className="stack">
            <div className="field">
              <label className="label" htmlFor="email">Email</label>
              <div className="input-wrap">
                <Icon name="mail" />
                <input className={`input${fe.email || error ? ' is-invalid' : ''}`} id="email" type="email" autoComplete="username"
                  value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fe.email} aria-describedby={fe.email ? 'email-err' : undefined} />
              </div>
              {fe.email && <p className="error-text" id="email-err"><Icon name="alert" small /> {fe.email}</p>}
            </div>
            <div className="field">
              <label className="label" htmlFor="pw">Contraseña</label>
              <div className="input-wrap">
                <Icon name="lock" />
                <input className={`input${fe.password || error ? ' is-invalid' : ''}`} id="pw" type="password" autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!fe.password} aria-describedby={fe.password ? 'pw-err' : undefined} />
              </div>
              {fe.password && <p className="error-text" id="pw-err"><Icon name="alert" small /> {fe.password}</p>}
            </div>
            <button className="btn btn-primary btn-block" style={{ height: 46, fontSize: 15 }} type="submit" disabled={busy}>
              {busy ? 'Ingresando…' : 'Ingresar'}
            </button>
          </div>

          <p className="demo">
            Demo: <strong>admin@smartparking.local</strong> (Admin123!) o <strong>cliente1@smartparking.local</strong> (Cliente123!)
          </p>
        </form>
      </section>
    </main>
  );
}
