import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy de desarrollo: /auth -> Identity, /api -> API. Configurable por entorno.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const auth = env.VITE_PROXY_AUTH || 'http://localhost:3001';
  const api = env.VITE_PROXY_API || 'http://localhost:3002';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/auth': { target: auth, changeOrigin: true },
        '/api': { target: api, changeOrigin: true },
      },
    },
    preview: { port: 4173 },
  };
});
