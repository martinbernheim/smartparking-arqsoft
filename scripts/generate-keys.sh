#!/usr/bin/env bash
# Genera el par RSA 2048 para firmar/verificar los JWT (RS256) en keys/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p keys

if [[ -f keys/private.pem && -f keys/public.pem && "${1:-}" != "--force" ]]; then
  echo "keys/private.pem y keys/public.pem ya existen (usar --force para regenerar)."
  exit 0
fi

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out keys/private.pem
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
# Lectura para el usuario "node" del contenedor (entorno de desarrollo).
chmod 644 keys/private.pem keys/public.pem
echo "Claves generadas en keys/"
