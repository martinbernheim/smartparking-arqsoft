import type { Rol } from '../types';

export interface JwtClaims { sub: string; roles: Rol[]; exp: number }

// Solo lectura del payload en el navegador (sin verificar firma): la verificacion la hace la API.
export function decodeJwt(token: string): JwtClaims | null {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    const p = JSON.parse(json);
    const roles = (Array.isArray(p.roles) ? p.roles : []).filter((r: unknown) => r === 'ADMIN' || r === 'CLIENTE');
    if (typeof p.sub !== 'string' || typeof p.exp !== 'number') return null;
    return { sub: p.sub, roles, exp: p.exp };
  } catch {
    return null;
  }
}
