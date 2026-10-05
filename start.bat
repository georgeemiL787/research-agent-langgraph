@echo off
cd /d "%~dp0"
if not exist .venv py -3 -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install -r requirements-lock.txt
if errorlevel 1 exit /b 1
python -m pip install --no-deps -e .
if errorlevel 1 exit /b 1
if not exist .env copy .env.example .env
echo Starting API and Frontend...
start cmd /k ".venv\Scripts\uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload"
cd frontend
npm install
npm run dev
