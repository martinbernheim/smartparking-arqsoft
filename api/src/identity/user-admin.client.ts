import { CrearUsuarioResponseSchema, type CrearUsuarioRequest, type CrearUsuarioResponse } from '@smartparking/contracts';
import { BadGatewayError, ConflictError } from '../shared/errors';

// IUserAdmin: alta de usuarios en Identity. Se reenvía el JWT del ADMIN (D9).
export interface IUserAdmin {
  crearUsuario(bearerToken: string, req: CrearUsuarioRequest): Promise<CrearUsuarioResponse>;
}

export class UserAdminClient implements IUserAdmin {
  constructor(private readonly baseUrl: string) {}

  async crearUsuario(bearerToken: string, req: CrearUsuarioRequest): Promise<CrearUsuarioResponse> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/users`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new BadGatewayError('No se pudo contactar al servicio de identidad');
    }
    if (res.status === 409) throw new ConflictError('El email ya está registrado en Identity');
    if (!res.ok) throw new BadGatewayError(`Identity respondió ${res.status} al crear el usuario`);
    return CrearUsuarioResponseSchema.parse(await res.json());
  }
}
