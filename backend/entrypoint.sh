#!/bin/sh
# Démarrage du backend : migrations D'ABORD (Alembic est la source du schéma —
# jamais de schema.sql), puis le serveur. Un échec de migration bloque le boot :
# mieux vaut un conteneur arrêté qu'une API sur un schéma décalé.
#
# Au premier lancement, MySQL passe son healthcheck pendant son initialisation
# interne, avant d'accepter les connexions réseau : on réessaie 30 s maximum.
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
