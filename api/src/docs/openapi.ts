// Especificación OpenAPI mínima (estática) servida en /api/docs.
const bearer = [{ bearerAuth: [] }];
const err = (description: string) => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const body = (ref: string) => ({ required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } });
const ok = (description: string, ref: string, array = false) => ({
  description,
  content: {
    'application/json': {
      schema: array ? { type: 'array', items: { $ref: `#/components/schemas/${ref}` } } : { $ref: `#/components/schemas/${ref}` },
    },
  },
});
const common = { 401: err('No autenticado / token inválido o expirado'), 403: err('Rol o pertenencia insuficiente') };

export const openapi = {
  openapi: '3.0.3',
  info: { title: 'SmartParking API', version: '0.1.0', description: 'Clientes, Vehículos y Reservas. Auth: JWT RS256 emitido por Identity (POST /auth/login).' },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' } } },
      Cliente: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, nombre: { type: 'string' }, email: { type: 'string' }, telefono: { type: 'string' }, identityUserId: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' } } },
      CrearCliente: { type: 'object', required: ['nombre', 'email', 'password'], properties: { nombre: { type: 'string' }, email: { type: 'string' }, telefono: { type: 'string' }, password: { type: 'string', minLength: 8 } } },
      ActualizarCliente: { type: 'object', properties: { nombre: { type: 'string' }, telefono: { type: 'string', nullable: true } } },
      Vehiculo: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, matricula: { type: 'string', example: 'SBA 1234' }, marca: { type: 'string' }, modelo: { type: 'string' }, clienteId: { type: 'string', format: 'uuid' } } },
      CrearVehiculo: { type: 'object', required: ['matricula'], properties: { matricula: { type: 'string' }, marca: { type: 'string' }, modelo: { type: 'string' }, clienteId: { type: 'string', format: 'uuid', description: 'Solo ADMIN (obligatorio); un CLIENTE lo ignora' } } },
      ActualizarVehiculo: { type: 'object', properties: { matricula: { type: 'string' }, marca: { type: 'string', nullable: true }, modelo: { type: 'string', nullable: true } } },
      Reserva: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, vehiculoId: { type: 'string', format: 'uuid' }, clienteId: { type: 'string', format: 'uuid' }, inicio: { type: 'string', format: 'date-time' }, fin: { type: 'string', format: 'date-time' }, estado: { type: 'string', enum: ['ACTIVA', 'CANCELADA'] } } },
      CrearReserva: { type: 'object', required: ['vehiculoId', 'inicio', 'fin'], properties: { vehiculoId: { type: 'string', format: 'uuid' }, inicio: { type: 'string', format: 'date-time' }, fin: { type: 'string', format: 'date-time' } } },
      ActualizarReserva: { type: 'object', required: ['inicio', 'fin'], properties: { inicio: { type: 'string', format: 'date-time' }, fin: { type: 'string', format: 'date-time' } } },
    },
  },
  paths: {
    '/health': { get: { summary: 'Health', responses: { 200: { description: 'ok' } } } },
    '/api/clientes': {
      post: { tags: ['Clientes'], summary: 'Alta de cliente (ADMIN): crea usuario en Identity y Cliente', security: bearer, requestBody: body('CrearCliente'), responses: { 201: ok('Creado', 'Cliente'), 400: err('Validación'), 409: err('Email duplicado'), ...common } },
      get: { tags: ['Clientes'], summary: 'Listar clientes (ADMIN)', security: bearer, parameters: [{ name: 'page', in: 'query', schema: { type: 'integer' } }, { name: 'pageSize', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: '{items,total,page,pageSize}' }, ...common } },
    },
    '/api/clientes/me': { get: { tags: ['Clientes'], summary: 'Perfil del CLIENTE autenticado', security: bearer, responses: { 200: ok('OK', 'Cliente'), ...common } } },
    '/api/clientes/{id}': {
      get: { tags: ['Clientes'], summary: 'Obtener (ADMIN)', security: bearer, parameters: [idParam], responses: { 200: ok('OK', 'Cliente'), 404: err('No existe'), ...common } },
      put: { tags: ['Clientes'], summary: 'Modificar (ADMIN)', security: bearer, parameters: [idParam], requestBody: body('ActualizarCliente'), responses: { 200: ok('OK', 'Cliente'), 404: err('No existe'), ...common } },
      delete: { tags: ['Clientes'], summary: 'Eliminar (ADMIN); 409 si tiene reservas ACTIVAS', security: bearer, parameters: [idParam], responses: { 204: { description: 'Eliminado' }, 404: err('No existe'), 409: err('Reservas activas'), ...common } },
    },
    '/api/vehiculos': {
      post: { tags: ['Vehículos'], summary: 'Alta (CLIENTE propio / ADMIN con clienteId)', security: bearer, requestBody: body('CrearVehiculo'), responses: { 201: ok('Creado', 'Vehiculo'), 409: err('Matrícula duplicada'), ...common } },
      get: { tags: ['Vehículos'], summary: 'Listar (CLIENTE: propios; ADMIN: todos, ?clienteId)', security: bearer, responses: { 200: ok('OK', 'Vehiculo', true), ...common } },
    },
    '/api/vehiculos/{id}': {
      get: { tags: ['Vehículos'], summary: 'Obtener', security: bearer, parameters: [idParam], responses: { 200: ok('OK', 'Vehiculo'), 404: err('No existe o ajeno'), ...common } },
      put: { tags: ['Vehículos'], summary: 'Modificar', security: bearer, parameters: [idParam], requestBody: body('ActualizarVehiculo'), responses: { 200: ok('OK', 'Vehiculo'), 404: err('No existe o ajeno'), ...common } },
      delete: { tags: ['Vehículos'], summary: 'Eliminar; 409 si tiene reservas ACTIVAS', security: bearer, parameters: [idParam], responses: { 204: { description: 'Eliminado' }, 404: err('No existe o ajeno'), 409: err('Reservas activas'), ...common } },
    },
    '/api/reservas': {
      post: { tags: ['Reservas'], summary: 'Crear reserva; 409 si el vehículo ya tiene una ACTIVA que se solapa', security: bearer, requestBody: body('CrearReserva'), responses: { 201: ok('Creada', 'Reserva'), 400: err('Validación / fin <= inicio'), 404: err('Vehículo inexistente o ajeno'), 409: err('Solapamiento'), ...common } },
    },
    '/api/reservas/mias': { get: { tags: ['Reservas'], summary: 'Reservas del CLIENTE autenticado (RF4)', security: bearer, responses: { 200: ok('OK', 'Reserva', true), ...common } } },
    '/api/reservas/{id}': {
      get: { tags: ['Reservas'], summary: 'Obtener', security: bearer, parameters: [idParam], responses: { 200: ok('OK', 'Reserva'), 404: err('No existe o ajena'), ...common } },
      put: { tags: ['Reservas'], summary: 'Modificar fechas (revalida solapamiento)', security: bearer, parameters: [idParam], requestBody: body('ActualizarReserva'), responses: { 200: ok('OK', 'Reserva'), 409: err('Solapamiento / no activa'), ...common } },
    },
    '/api/reservas/{id}/cancelar': { post: { tags: ['Reservas'], summary: 'Cancelar (estado CANCELADA)', security: bearer, parameters: [idParam], responses: { 200: ok('OK', 'Reserva'), 404: err('No existe o ajena'), ...common } } },
    '/api/admin/reservas': {
      get: {
        tags: ['Reservas'], summary: 'Consulta ADMIN con filtros (RF5)', security: bearer,
        parameters: [
          { name: 'clienteId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'estado', in: 'query', schema: { type: 'string', enum: ['ACTIVA', 'CANCELADA'] } },
          { name: 'desde', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: { 200: { description: '{items: Reserva[], total, page, pageSize}' }, 400: err('Filtro inválido'), ...common },
      },
    },
  },
};
