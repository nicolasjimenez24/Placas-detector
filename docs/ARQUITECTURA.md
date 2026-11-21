# PlacaVision — Detector de Placas Vehiculares (datos simulados)

## Objetivo
Sistema completo que **genera imágenes sintéticas** de vehículos con placas y **detecta y lee**
cada placa con un pipeline real de visión por computador (OpenCV + OCR por plantillas).
Todos los datos son simulados (no hay placas reales).

## Entorno
- Windows 11, Python 3.12 (`python`), Git Bash disponible.
- Fuente para placas y plantillas OCR: `C:/Windows/Fonts/arialbd.ttf` (fallback: `consolab.ttf`).
  Resolver la ruta en un solo sitio (`backend/app/fonts.py`) para que generador y detector usen la misma.

## Fases de trabajo (dirigidas por el Agente Orquestador)
| Fase | Agente | Entregable |
|------|--------|-----------|
| 0 | Orquestador | Arquitectura + contrato de API (este documento) |
| 1 | Agente Backend | `backend/`: generador sintético, motor de detección, API FastAPI, SQLite, tests |
| 2 | Agente Frontend | `frontend/`: SPA (HTML/CSS/JS sin build) servida por el backend |
| 3 | Agente QA | Pruebas end-to-end, revisión de UI, correcciones |
| 4 | Orquestador | Integración final, README, entrega |

## Estructura
```
placas-detector/
  backend/
    app/
      main.py          # FastAPI: rutas /api/* y sirve frontend/ en "/"
      fonts.py         # Resolución de la fuente
      generator.py     # Generación de escenas sintéticas (Pillow)
      detector.py      # Pipeline de detección + OCR (OpenCV/numpy)
      storage.py       # SQLite (historial) + carpeta data/images
      schemas.py       # Modelos Pydantic v2
    tests/             # pytest
    requirements.txt
  frontend/
    index.html, styles.css, app.js
  data/                # generado en ejecución (imágenes, placas.db) — en .gitignore
  run.bat              # arranque en Windows: uvicorn en puerto 8000
```

## Formato de placa simulada
- Texto `AAA-123` (3 letras + guion + 3 dígitos). Letras: A-Z sin I, O, Q.
- Placa amarilla (~RGB(250, 204, 21)), borde negro, caracteres negros, texto inferior pequeño con
  una ciudad ficticia (p. ej. "CIUDAD SIM"). Relación de aspecto ≈ 2.4–3.2 : 1.
- Escena 960×600 px, fondo de calle/parqueadero simulado, **1 a 3 vehículos** por imagen.
- Dificultad easy/medium/hard: rotación (0/±3/±6°), escala, brillo/contraste, ruido, desenfoque, sombras.
- Cada escena guarda su *ground truth* (texto y bbox de cada placa).

## Pipeline de detección (detector.py)
1. Preprocesado (BGR→HSV).
2. Segmentación por color amarillo + morfología → contornos candidatos.
3. Filtros: área, aspecto, rectangularidad → enderezado con minAreaRect.
4. Binarización y segmentación de caracteres (componentes conectados), ignorando borde y franja de ciudad.
5. OCR por *template matching* contra glifos renderizados con la misma fuente (plantillas aumentadas, cacheadas).
6. Validación `AAA-123` con corrección posición-dependiente (0↔D, 8↔B, 5↔S, 2↔Z, 6↔G, 1↔L/T…).
7. Salida: texto, confianza global y por carácter, bbox, recorte y una imagen anotada.
Cada etapa reporta su tiempo en ms (`stages`).

## Contrato de API (JSON, prefijo /api)
- `GET  /api/health` → `{"status":"ok","version":"1.0.0"}`
- `POST /api/simulate` body `{"count":1..12, "seed": int|null, "difficulty":"easy"|"medium"|"hard"}`
  → `{"scenes":[Scene]}`
  - `Scene = {"id": str, "image_url": str, "width": int, "height": int, "difficulty": str,
     "ground_truth":[{"text": str, "bbox":[x,y,w,h]}], "created_at": iso8601}`
- `POST /api/detect` body `{"scene_id": str}` → `Detection`
- `POST /api/detect/upload` multipart `file` (png/jpg) → `Detection` (sin ground truth)
- `POST /api/detect/batch` body `{"count":1..50, "seed": int|null, "difficulty": str}`
  → `{"results":[Detection], "metrics": Metrics}`
- `GET  /api/scenes?limit=50` → `{"scenes":[Scene]}`
- `GET  /api/history?limit=50` → `{"detections":[Detection]}`
- `GET  /api/history/{detection_id}` → `Detection`
- `DELETE /api/history` → `{"deleted": int}` (borra historial y escenas)
- `GET  /api/stats` → `Metrics` global
- `GET  /api/images/{filename}` → PNG (originales, anotadas y recortes)

```
Detection = {
  "id": str, "scene_id": str|null, "source": "simulated"|"upload",
  "image_url": str, "annotated_url": str, "width": int, "height": int,
  "difficulty": str|null,
  "plates": [Plate], "ground_truth": [GT] | null,
  "evaluation": {"matched": int, "expected": int, "exact_matches": int,
                 "char_accuracy": float, "correct": bool} | null,
  "processing_ms": float,
  "stages": [{"name": str, "ms": float}],
  "created_at": iso8601
}
Plate = {"text": str, "confidence": float (0-1), "bbox":[x,y,w,h],
         "chars":[{"char": str, "confidence": float}], "crop_url": str, "valid_format": bool}
Metrics = {"total_detections": int, "total_plates": int, "plate_accuracy": float (0-1),
           "char_accuracy": float, "detection_rate": float, "avg_confidence": float,
           "avg_processing_ms": float,
           "by_difficulty": {"easy": DiffMetrics, "medium": DiffMetrics, "hard": DiffMetrics}}
DiffMetrics = {"detections": int, "plate_accuracy": float, "char_accuracy": float,
               "detection_rate": float, "avg_processing_ms": float}
```
Errores: `{"detail": str}` con código HTTP 4xx/5xx.

## Requisitos no funcionales
- Arranque con un solo comando (`run.bat`) en http://localhost:8000.
- Precisión objetivo (placas exactas): ≥ 95 % `easy`, ≥ 90 % `medium`, ≥ 75 % `hard`.
- Latencia < 500 ms por imagen.
- Interfaz en **español**, moderna, responsive, modo oscuro, accesible.
