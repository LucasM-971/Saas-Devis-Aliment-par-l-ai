# Backend FastAPI — image du pilote (Alembic = source du schéma).
FROM python:3.13-slim

# Dépendances système de WeasyPrint (rendu PDF du devis) : pango/cairo/harfbuzz,
# plus curl pour le healthcheck compose et des fontes de base pour le PDF.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz0b \
    libharfbuzz-subset0 \
    libgdk-pixbuf-2.0-0 \
    libffi8 \
    shared-mime-info \
    fonts-dejavu-core \
    curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Alembic (env.py) et scripts.* importent le package "app" depuis /app.
ENV PYTHONPATH=/app PYTHONUNBUFFERED=1

# L'échec d'installation DOIT casser le build : une image construite sans ses
# dépendances ne planterait qu'au démarrage, en production, chez l'artisan.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# L'API n'a aucune raison de tourner root dans le conteneur.
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# alembic upgrade head puis uvicorn — voir entrypoint.sh.
ENTRYPOINT ["./entrypoint.sh"]
