import type { Request, Response } from 'express';
import { LoginRequestSchema } from '@smartparking/contracts';
import type { CredentialValidator } from './credential-validator';
import type { TokenIssuer } from './token-issuer';
import { buildJwks } from './jwks';
import type { KeyPair } from '../keys/key-provider';

export class AuthController {
  private readonly jwks: ReturnType<typeof buildJwks>;

  constructor(
    private readonly validator: CredentialValidator,
    private readonly issuer: TokenIssuer,
    keys: KeyPair,
  ) {
    this.jwks = buildJwks(keys);
  }

  login = async (req: Request, res: Response) => {
    const { email, password } = LoginRequestSchema.parse(req.body);
    const user = await this.validator.validate(email, password);
    res.json(this.issuer.issue(user.id, user.roles));
  };

  getJwks = (_req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=300').json(this.jwks);
  };
}
