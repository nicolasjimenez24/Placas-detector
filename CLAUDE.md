# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

PlacaVision: identificación de placas vehiculares en **fotos reales** con un modelo entrenado (YOLO11n + CRNN/CTC). Backend FastAPI, frontend vanilla JS servido por el mismo backend, login obligatorio. Código, comentarios, mensajes de la API e interfaz están en **español**; mantén ese idioma. Ya no existen escenas simuladas ni motor clásico: no los reintroduzcas.

## Comandos

Entorno principal: Windows (usar `python`, no `python3`). Todo se ejecuta desde la raíz, porque los imports son `backend.app.*`. En Git Bash los heredocs con texto en español suelen fallar: escribe los scripts en un archivo.

```bash
run.bat                                                         # instala requirements y arranca en http://localhost:8000
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
# atajos equivalentes, con --reload: run.ps1, npm start / npm run dev, npm test (package.json solo envuelve comandos Python)
python -m pytest backend/tests -q                               # todas las pruebas (~35 s)
python -m pytest "backend/tests/test_auth.py::test_lockout_after_failed_attempts" -q   # una prueba
python -m backend.tests.report        # corre pytest y guarda backend/models/test_report.json (vista «Pruebas»)
python ml/evaluate_gallery.py         # evalúa las 168 fotos -> backend/models/gallery_report.json
python ml/build_gallery.py            # arma backend/gallery/ desde ml/datasets
python -m backend.app.auth crear-usuario <usuario> --nombre "..."   # usuarios desde la terminal
```

- Si cambias el modelo, el post-proceso o la evaluación, regenera **los dos informes**: la interfaz muestra esas cifras al usuario.
- `conftest.py` fija `PLACAS_DATA_DIR` a una carpeta temporal antes de importar la app, crea el administrador de prueba y expone `client` (con sesión) y `anon` (sin sesión). Las pruebas nunca tocan `data/`.
- Para probar la interfaz en el navegador, levanta otro servidor con `PLACAS_DATA_DIR` temporal en otro puerto, para no crear usuarios en la base real del usuario. Playwright para Python está instalado; usa `chromium.launch(channel="msedge")`.
- No hay linter ni paso de build.

## Arquitectura

**Pipeline** (`ml_inference.detect`, serializado con un lock porque YOLO no es seguro entre hilos): YOLO en dos escalas + NMS → recorte → CRNN (`ml_models.py`, compartido con `ml/train_ocr.py`: cambiarlo invalida los pesos) → `colombian_format` → anotación. `colombian_format` solo corrige letra↔dígito en lecturas de exactamente 6 caracteres (máximo 2 cambios). Así no deforma placas extranjeras, que son casi todo el dataset público. Las cajas superpuestas sobre la misma placa se reducen a la más confiable. Devuelve `results.DetectionResult`.

**Galería** (`gallery.py`): `backend/gallery/catalog.json` con dos conjuntos. `dataset` tiene 150 fotos CC BY 4.0 con caja; su texto es de TrOCR y es `null` si es ilegible. `colombia` tiene 18 fotos con texto anotado a mano y `bbox: null`; su carpeta está ignorada por git porque no tiene licencia, y no debe subirse.

**Evaluación** (`main.evaluate`, reutilizada por `ml/evaluate_gallery.py`): las esperadas con caja se emparejan por IoU ≥ 0,3; las que no tienen caja, por menor distancia de edición. Las métricas de lectura solo cuentan placas con texto conocido (`readable`). El frontend replica el emparejamiento en `matchGT`; si cambias uno, cambia el otro.

**Auth** (`auth.py`): un middleware en `main.py` exige sesión en todo `/api/*` salvo `auth.PUBLIC_API`. Usa PBKDF2 y guarda en SQLite solo el SHA-256 del token de la cookie `pv_session`. `POST /api/auth/setup` funciona solo si no hay usuarios. En el frontend, `index.html` se oculta (`auth-pending`) hasta que `init()` confirma la sesión; cualquier 401 lleva a `login.html?next=#vista`.

**Rutas en `main.py`**: primero `/api/*`, luego un catch‑all 404 en JSON y al final `frontend/` como estáticos. Las rutas nuevas van antes del catch‑all. Los errores de validación se reescriben a `{"detail": "texto"}`.

**Persistencia** (`storage.py`): una sola conexión SQLite (WAL, `RLock`) con las tablas `detections` (JSON completo en `data`), `users` y `sessions`. `_migrate_from_simulated` convierte bases antiguas y conserva solo las subidas. `DELETE /api/history` no borra usuarios.

**Frontend**: `app.js` es un único IIFE sin dependencias ni build, y debe funcionar sin conexión: sin CDNs, y el texto entra siempre por `textContent` mediante `h()`. Las vistas (`VIEWS`, teclas 1–8) son inicio, detector, upload, batch, history, stats, model y tests. «Inicio» y «Pruebas» leen `/api/report`; «Modelo» lee `/api/model` (`model_card.json`). Los nombres de etapa del pipeline se traducen en `STAGE_LABELS`.

Contrato completo de la API: `docs/ARQUITECTURA.md`. Si cambias la API, actualiza `schemas.py`, ese documento y `app.js`.
