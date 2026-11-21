@echo off
REM PlacaVision - arranque en Windows (http://localhost:8000)
cd /d "%~dp0"
echo Instalando dependencias...
python -m pip install -r backend\requirements.txt -q
if errorlevel 1 (
  echo Error instalando dependencias.
  pause
  exit /b 1
)
echo Iniciando PlacaVision en http://localhost:8000 ...
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
