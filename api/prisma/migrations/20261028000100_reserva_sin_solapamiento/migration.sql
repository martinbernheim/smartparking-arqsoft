-- Migración manual (Prisma no modela EXCLUDE): un vehículo no puede tener dos reservas ACTIVAS
-- que se solapen. Intervalos semiabiertos [inicio, fin): reservas adyacentes están permitidas.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "reservas"
  ADD CONSTRAINT "reserva_fin_posterior_inicio" CHECK ("fin" > "inicio");

ALTER TABLE "reservas"
  ADD CONSTRAINT "reserva_sin_solapamiento"
  EXCLUDE USING gist ("vehiculo_id" WITH =, tstzrange("inicio", "fin") WITH &&)
  WHERE ("estado" = 'ACTIVA');
