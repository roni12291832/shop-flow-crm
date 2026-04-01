#!/bin/bash
set -e

echo "[START] Iniciando WA Connector (Node.js)..."
cd /app/wa-connector
node index.js &
echo "[START] WA Connector iniciado"

echo "[START] Aguardando 3s..."
sleep 3

echo "[START] Iniciando Python Backend (FastAPI)..."
cd /app
exec uvicorn main:app --host 0.0.0.0 --port 8000
