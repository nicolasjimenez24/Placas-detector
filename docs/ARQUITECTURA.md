# PlacaVision — Arquitectura y contrato de API

## Objetivo
Identificar placas vehiculares en **fotos reales**: localizar cada placa y leer su texto con un modelo
entrenado (detector YOLO11n + lector CRNN/CTC), y medir el acierto contra el valor esperado de cada foto.

## Componentes
```
backend/app/
  main.py          API FastAPI (/api/*), evaluación y métricas; sirve frontend/ en "/"
  auth.py          Usuarios, contraseñas (PBKDF2), sesiones por cookie, protección de la API
  ml_inference.py  Pipeline del modelo: YOLO -> recorte -> CRNN -> formato colombiano
  ml_models.py     Red CRNN (compartida con ml/train_ocr.py)
  results.py       Estructuras de resultado, IoU y anotación de imágenes
  gallery.py       Galería de fotos reales con su valor esperado (backend/gallery/)
  storage.py       SQLite (historial, usuarios, sesiones) + PNG en data/images
  schemas.py       Modelos Pydantic del contrato
backend/models/    Pesos (.pt), model_card.json, gallery_report.json, test_report.json
backend/gallery/   catalog.json + fotos (dataset/ en git; colombia/ solo local)
frontend/          index.html + app.js (aplicación), login.html + login.js, styles.css
ml/                Preparación de datos, entrenamiento, evaluación y armado de la galería
```

## Datos
| Conjunto | Fotos | Valor esperado | Licencia |
|---|---|---|---|
| `dataset` | 150 (partición de prueba, nunca vista al entrenar) | caja de cada placa + texto (generado por TrOCR; `null` si es ilegible) | CC BY 4.0 |
| `colombia` | 18 | texto anotado a mano, sin caja (`bbox: null`) | sin licencia: solo uso local, ignorado por git |

## Pipeline del modelo (`ml_inference.detect`)
1. **Detección** (`yolo_deteccion`): YOLO11n sobre la foto y sobre la foto en un lienzo 3× mayor
   (para primeros planos); NMS conjunto.
2. **Recorte** (`recorte`): cada caja con un margen.
3. **Lectura** (`crnn_lectura`): CRNN + decodificación CTC voraz, confianza por carácter.
4. **Formato** (`formato_colombiano`): se busca una subcadena `ABC123`; solo si la lectura tiene
   6 caracteres se corrigen confusiones letra/dígito (máx. 2). Las placas extranjeras no se deforman.
   Cajas superpuestas sobre la misma placa: se queda la de mayor confianza.
5. **Anotación** (`anotacion`). Confianza de la placa = confianza YOLO × confianza media del CRNN.

## Evaluación (`main.evaluate`)
Emparejamiento: esperadas con caja por IoU ≥ 0,3 (voraz); sin caja, con la detección cuya lectura se
parezca más (distancia de edición). Se compara el texto normalizado (solo `A-Z0-9`).
`plate_accuracy` y `char_accuracy` se calculan solo sobre placas con texto conocido;
`char_accuracy` = 1 − distancia de edición / longitud. `correct` = todas localizadas, todas las legibles
exactas y sin falsos positivos.

## Autenticación
- Toda ruta `/api/*` exige sesión, salvo `/api/health` y `/api/auth/{status,login,setup,logout}` → si no, `401`.
- Primer uso: `POST /api/auth/setup` crea el administrador (solo si no hay usuarios).
- Contraseñas: PBKDF2-HMAC-SHA256, 240 000 iteraciones, sal aleatoria. Mínimo 8 caracteres con letras y números.
- Sesión: cookie `pv_session` HttpOnly, SameSite=Lax, 8 h; en la base solo el SHA-256 del token.
- 5 intentos fallidos seguidos → bloqueo de 60 s (`429`).
- Más usuarios: `python -m backend.app.auth crear-usuario <usuario> --nombre "..."`.

## Contrato de API (JSON, prefijo /api)
- `GET  /health` → `{"status":"ok","version":"2.0.0","model_available":bool}`
- `GET  /auth/status` → `{"setup_required":bool,"user":User|null}` · `POST /auth/setup` `{username,name,password}` ·
  `POST /auth/login` `{username,password}` → `{"user":User}` · `POST /auth/logout` · `GET /auth/me`
- `GET  /gallery?set=all|colombia|dataset` → `{"photos":[Photo],"sets":{nombre: SetInfo}}`
- `GET  /gallery/{photo_id}/image` → JPEG
- `POST /detect` `{"photo_id": str}` → `Detection` (404 si no existe; 503 sin modelo)
- `POST /detect/upload` multipart `file` (PNG/JPG/WebP, ≤ 15 MB; > 2000 px se reduce) → `Detection` sin evaluación
- `POST /detect/batch` `{"count":1..50,"seed":int|null,"set":"all"|"colombia"|"dataset"}` → `{"results":[Detection],"metrics":Metrics}`
- `GET  /history?limit=1..1000` · `GET /history/{id}` · `DELETE /history` → `{"deleted":int}`
- `GET  /stats` → `Metrics` · `GET /model` → `{"available":bool,"card":{...}|null}`
- `GET  /report` → `{"gallery": informe de ml/evaluate_gallery.py | null, "tests": informe de pytest | null}`
- `GET  /images/{archivo}.png` → recortes, anotadas y subidas

```
Photo = {"id": str, "set": "colombia"|"dataset", "image_url": str, "width": int, "height": int,
         "ground_truth": [{"text": str|null, "bbox": [x,y,w,h]|null}]}
Detection = {"id", "photo_id": str|null, "photo_set": str|null, "source": "gallery"|"upload",
  "image_url", "annotated_url", "width", "height", "plates": [Plate], "ground_truth": [..]|null,
  "evaluation": {"expected","matched","readable","exact_matches","char_accuracy","correct"}|null,
  "processing_ms", "stages": [{"name","ms"}], "created_at"}
Plate = {"text", "confidence", "bbox", "chars": [{"char","confidence"}], "crop_url",
         "valid_format", "raw_text", "detection_confidence"}
Metrics = {"total_detections","total_plates","plate_accuracy","char_accuracy","detection_rate",
           "avg_confidence","avg_processing_ms","by_set": {"colombia": {...}, "dataset": {...}}}
```
Errores: `{"detail": "texto en español"}`.
