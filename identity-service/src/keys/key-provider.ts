import { createHash, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface KeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
  kid: string;
}

// kid = SHA-256 (hex, 16 chars) del DER de la clave pública.
export function buildKeyPair(privateKeyPem: string, publicKeyPem?: string): KeyPair {
  const publicKey = createPublicKey(publicKeyPem ?? privateKeyPem);
  const der = publicKey.export({ format: 'der', type: 'spki' });
  const kid = createHash('sha256').update(der).digest('hex').slice(0, 16);
  return {
    privateKeyPem,
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    kid,
  };
}

export function loadKeyPair(privatePath: string, publicPath?: string): KeyPair {
  return buildKeyPair(
    readFileSync(privatePath, 'utf8'),
    publicPath ? readFileSync(publicPath, 'utf8') : undefined,
  );
}
