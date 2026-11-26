#!/bin/sh
# Applique les migrations puis lance le serveur.
# Réessaie 30 s le temps que MySQL accepte les connexions.
set -e

tries=0
until alembic upgrade head; do
  tries=$((tries + 1))
  if [ "$tries" -ge 15 ]; then
    echo "Migrations impossibles après $tries essais : arrêt." >&2
    exit 1
  fi
  echo "Base pas encore prête, nouvel essai dans 2 s ($tries/15)…"
  sleep 2
done

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
