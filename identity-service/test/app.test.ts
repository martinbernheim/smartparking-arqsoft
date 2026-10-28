import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { buildKeyPair } from '../src/keys/key-provider';
import { ConflictError } from '../src/shared/errors';
import { PasswordHasher } from '../src/users/password-hasher';
import type { NewUser, User, UserRepository } from '../src/users/user.repository';

// Repositorio en memoria (mock): sin dependencia de Mongo.
class InMemoryRepo implements UserRepository {
  users: User[] = [];
  async findByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async create(u: NewUser) {
    if (await this.findByEmail(u.email)) throw new ConflictError();
    const user = { ...u, id: u.id ?? String(this.users.length + 1).padStart(24, '0') } as User;
    this.users.push(user);
    return user;
  }
}

const env = { JWT_ISSUER: 'test-issuer', JWT_EXPIRES_IN: 3600, BCRYPT_ROUNDS: 4 };
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keys = buildKeyPair(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());

let app: ReturnType<typeof createApp>;
let adminToken: string;
let clientToken: string;

const login = (email: string, password: string) => request(app).post('/auth/login').send({ email, password });

beforeAll(async () => {
  const repo = new InMemoryRepo();
  const hasher = new PasswordHasher(4);
  await repo.create({ email: 'admin@t.local', passwordHash: await hasher.hash('Admin123!'), roles: ['ADMIN'] });
  await repo.create({ email: 'c@t.local', passwordHash: await hasher.hash('Cliente123!'), roles: ['CLIENTE'] });
  app = createApp({ env, keys, repo });
  adminToken = (await login('admin@t.local', 'Admin123!')).body.accessToken;
  clientToken = (await login('c@t.local', 'Cliente123!')).body.accessToken;
});

describe('POST /auth/login', () => {
  it('devuelve JWT RS256 con los claims esperados', async () => {
    const res = await login('admin@t.local', 'Admin123!');
    expect(res.status).toBe(200);
    expect(res.body.expiresIn).toBe(3600);
    const decoded = jwt.verify(res.body.accessToken, keys.publicKeyPem, {
      algorithms: ['RS256'],
      issuer: 'test-issuer',
      complete: true,
    });
    expect(decoded.header.kid).toBe(keys.kid);
    const p = decoded.payload as jwt.JwtPayload;
    expect(p.roles).toEqual(['ADMIN']);
    expect(p.sub).toBeTruthy();
    expect(p.exp! - p.iat!).toBe(3600);
  });

  it('401 con clave errónea y con usuario inexistente (mismo mensaje)', async () => {
    const a = await login('admin@t.local', 'x');
    const b = await login('no@t.local', 'x');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it('400 con body inválido', async () => {
    expect((await request(app).post('/auth/login').send({ email: 'nope' })).status).toBe(400);
  });
});

describe('JWKS', () => {
  it.each(['/.well-known/jwks.json', '/auth/.well-known/jwks.json'])('%s expone la clave pública', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age=300');
    expect(res.body.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig', kid: keys.kid });
    expect(res.body.keys[0].n).toBeTruthy();
    expect(res.body.keys[0].d).toBeUndefined();
  });
});

describe('POST /users', () => {
  const body = { email: 'nuevo@t.local', password: 'Password123', rol: 'CLIENTE' };
  const post = (token?: string, b: object = body) => {
    const r = request(app).post('/users');
    return (token ? r.set('Authorization', `Bearer ${token}`) : r).send(b);
  };

  it('401 sin token', async () => {
    expect((await post()).status).toBe(401);
  });
  it('403 con token CLIENTE', async () => {
    expect((await post(clientToken)).status).toBe(403);
  });
  it('400 con body inválido', async () => {
    expect((await post(adminToken, { email: 'x' })).status).toBe(400);
  });
  it('201 y luego 409 si el email se repite', async () => {
    const ok = await post(adminToken);
    expect(ok.status).toBe(201);
    expect(ok.body.identityUserId).toBeTruthy();
    expect((await post(adminToken)).status).toBe(409);
  });
});

describe('/health', () => {
  it('200', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
  });
});
