# PlacaVision - Arranque en Windows PowerShell
Write-Host "Iniciando PlacaVision en http://localhost:8000 ..." -ForegroundColor Cyan
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
