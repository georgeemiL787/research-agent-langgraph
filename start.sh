#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
. .venv/bin/activate
python -m pip install -r requirements-lock.txt
python -m pip install --no-deps -e .
[ -f .env ] || cp .env.example .env
echo "Starting API..."
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload &

echo "Starting Frontend..."
cd frontend
npm install
npm run dev
