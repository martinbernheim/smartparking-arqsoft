import { AppError } from './errors';

export class BadRequest extends AppError {
  constructor(message = 'Solicitud inválida') {
    super(400, message);
  }
}
