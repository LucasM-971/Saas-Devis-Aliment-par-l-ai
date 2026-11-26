#!/bin/sh
# Dump MySQL compressé, rotation 14 jours.
set -e

: "${MYSQL_HOST:=db}"
: "${MYSQL_USER:=devis}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD requis}"
: "${MYSQL_DATABASE:=devis_ai}"
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_RETENTION_DAYS:=14}"

STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

mysqldump \
  -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" \
  --single-transaction --routines --no-tablespaces \
  "$MYSQL_DATABASE" | gzip > "$BACKUP_DIR/devis_ai-$STAMP.sql.gz"

find "$BACKUP_DIR" -name 'devis_ai-*.sql.gz' -mtime "+$BACKUP_RETENTION_DAYS" -delete

echo "backup OK : devis_ai-$STAMP.sql.gz (rotation ${BACKUP_RETENTION_DAYS} j)"
