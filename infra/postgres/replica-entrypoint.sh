#!/bin/bash
# Arranque de la réplica: base backup desde la primaria (si el volumen está vacío) y luego postgres en hot standby.
set -e
PGDATA=/var/lib/postgresql/data
if [ -z "$(ls -A "$PGDATA" 2>/dev/null)" ]; then
  echo "Clonando primaria $PRIMARY_HOST..."
  PGPASSWORD="$REPLICATION_PASSWORD" pg_basebackup -h "$PRIMARY_HOST" -U "$REPLICATION_USER" -D "$PGDATA" -R -X stream
fi
chown -R postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"
exec gosu postgres postgres -c hot_standby=on
