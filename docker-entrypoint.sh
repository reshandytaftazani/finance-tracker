#!/bin/sh
set -e

echo "[entrypoint] Memeriksa direktori data dan backup..."
mkdir -p /app/data /app/backups

echo "[entrypoint] Menjalankan migration database..."
python -m scripts.migrate

echo "[entrypoint] Melakukan bootstrap / seed awal bila diperlukan..."
python -m scripts.seed

if [ -n "$APP_OWNER_PASSWORD" ]; then
    echo "[entrypoint] Menyetel password pemilik dari environment variable..."
    python -m scripts.auth set-password --env
fi

echo "[entrypoint] Memulai aplikasi..."
exec "$@"
