import jwt from 'jsonwebtoken';
import type { AuthResponse, Rol } from '@smartparking/contracts';
import type { KeyPair } from '../keys/key-provider';

export class TokenIssuer {
  constructor(
    private readonly keys: KeyPair,
    private readonly issuer: string,
    private readonly expiresIn: number,
  ) {}

  issue(identityUserId: string, roles: Rol[]): AuthResponse {
    const accessToken = jwt.sign({ roles }, this.keys.privateKeyPem, {
      algorithm: 'RS256',
      subject: identityUserId,
      issuer: this.issuer,
      expiresIn: this.expiresIn,
      keyid: this.keys.kid,
    });
    return { accessToken, expiresIn: this.expiresIn };
  }

  // Verificación con la clave pública propia (usada para proteger POST /users).
  verify(token: string): jwt.JwtPayload {
    return jwt.verify(token, this.keys.publicKeyPem, {
      algorithms: ['RS256'],
      issuer: this.issuer,
    }) as jwt.JwtPayload;
  }
}
