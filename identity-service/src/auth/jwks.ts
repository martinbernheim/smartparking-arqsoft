import { createPublicKey } from 'node:crypto';
import type { KeyPair } from '../keys/key-provider';

export function buildJwks(keys: KeyPair) {
  const jwk = createPublicKey(keys.publicKeyPem).export({ format: 'jwk' });
  return { keys: [{ ...jwk, kid: keys.kid, alg: 'RS256', use: 'sig' }] };
}
