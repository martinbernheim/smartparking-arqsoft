// Escenario 1: consultas de reservas bajo carga (RF4 + RF5) a través de Nginx.
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:8080';
const RATE = Number(__ENV.RATE || 500);

export const options = {
  scenarios: {
    consultas: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: __ENV.DURATION || '60s',
      preAllocatedVUs: Number(__ENV.PRE_VUS || 200),
      maxVUs: Number(__ENV.MAX_VUS || 1000),
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

function login(email, password) {
  const res = http.post(`${BASE}/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { [`login ${email}`]: (r) => r.status === 200 });
  return res.json('accessToken');
}

export function setup() {
  return {
    cliente: login(__ENV.CLIENT_EMAIL || 'cliente1@smartparking.local', __ENV.CLIENT_PASSWORD || 'Cliente123!'),
    admin: login(__ENV.ADMIN_EMAIL || 'admin@smartparking.local', __ENV.ADMIN_PASSWORD || 'Admin123!'),
  };
}

export default function (data) {
  // 50% "mis reservas" (cliente) / 50% listado admin filtrado.
  const esCliente = Math.random() < 0.5;
  const url = esCliente ? `${BASE}/api/reservas/mias` : `${BASE}/api/admin/reservas?estado=ACTIVA`;
  const res = http.get(url, { headers: { Authorization: `Bearer ${esCliente ? data.cliente : data.admin}` } });
  check(res, { 'status 200': (r) => r.status === 200 });
}
