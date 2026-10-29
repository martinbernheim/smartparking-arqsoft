import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { getSession, setSession } from './auth/session';
import './styles/tokens.css';
import './styles/app.css';

async function bootstrap() {
  // Modo demo (solo dev, VITE_MOCK=1): inicia sesion con el rol indicado en VITE_MOCK_ROLE.
  const demo = import.meta.env.VITE_MOCK === '1' ? import.meta.env.VITE_MOCK_ROLE : undefined;
  if (demo && !getSession()) {
    const { fakeToken } = await import('./api/mock');
    setSession(fakeToken(demo), demo === 'ADMIN' ? 'admin@smartparking.local' : 'cliente1@smartparking.local');
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
}
bootstrap();
