# PlacaVision — Detector de placas vehiculares (datos simulados)

Sistema completo que **genera imágenes sintéticas** de tráfico y **detecta y lee las placas** de cada
vehículo con un pipeline de visión por computador (OpenCV + OCR por plantillas). Incluye una API REST
(FastAPI), historial en SQLite y una interfaz web en español.

> Las escenas del Detector son simuladas (placas ficticias `AAA-123`). Para fotos reales, la app
> incluye un modelo entrenado que lee placas colombianas (`ABC123`); ver más abajo.

## Arranque rápido (Windows)

```bat
run.bat
```

Luego abre **http://localhost:8000**. El script instala las dependencias de `backend/requirements.txt`
y lanza el servidor. Requiere Python 3.10+.

Manual, desde la raíz del proyecto:

```bash
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

## Qué puedes hacer en la interfaz

| Sección | Función |
|---|---|
| **Detector** | Genera de 1 a 12 escenas (dificultad fácil/media/difícil, semilla opcional), detecta las placas y muestra recuadros, recorte, confianza por carácter, comparación con el valor esperado y tiempo por etapa del pipeline. |
| **Subir imagen** | Analiza un PNG/JPG propio (arrastrar y soltar), incluidas fotos reales de placas colombianas con el modelo entrenado. |
| **Evaluación por lotes** | Genera y procesa hasta 50 escenas; muestra precisión, latencia, histogramas y tabla con filtro de errores. |
| **Historial** | Todas las detecciones guardadas, con búsqueda y filtros; permite borrar el historial. |
| **Estadísticas** | Métricas acumuladas y comparativa por dificultad. |
| **Modelo** | Ficha del modelo entrenado: datos, métricas, curvas y prueba con fotos colombianas. |

Atajos: `G` generar, `A` detectar todas, `1`–`6` cambiar de sección, `?` ayuda.

## Cómo funciona la detección

1. Conversión a HSV y máscara del color amarillo de la placa.
2. Contornos candidatos filtrados por área, proporción y rectangularidad (descarta, p. ej., taxis amarillos).
3. Enderezado del recorte con `minAreaRect`.
4. Binarización y segmentación de caracteres por componentes conectados.
5. OCR por *template matching* contra glifos renderizados con la misma fuente.
6. Validación del formato `AAA-123` con corrección de confusiones según la posición (0↔D, 8↔B, 5↔S…).

El detector **nunca** usa el valor esperado: solo recibe la imagen. El valor esperado sirve únicamente para medir la precisión.

## Modelo entrenado para fotos reales (placas colombianas)

Además del detector clásico (pensado para las escenas simuladas), la app incluye **dos modelos
entrenados** que leen placas en fotos reales. Se usan por defecto en **Subir imagen**, y la vista
**Modelo** (atajo `6`) muestra sus datos, métricas y curvas de entrenamiento.

```
foto ──> Detector YOLO11n ──> recorte de cada placa ──> Lector CRNN + CTC ──> formato colombiano ABC123
```

| Pieza | Qué es | Cómo se entrenó |
|---|---|---|
| Detector | YOLO11n (preentrenado en COCO) ajustado a placas | 700 fotos reales, 15 épocas, 416 px, CPU (~55 min) |
| Lector | CRNN propio (CNN + BiLSTM, pérdida CTC), 0,67 M parámetros, entrenado desde cero | recortes reales + 10.000 placas colombianas sintéticas, 20 épocas, CPU |

**Datos.** [sonnetechnology/license-plate-text-recognition-full](https://huggingface.co/datasets/sonnetechnology/license-plate-text-recognition-full)
(CC BY 4.0, derivado de keremberke/license-plate-object-detection). Por ser un proyecto de clase se
usa una muestra fija de **1.000 fotos** (700 entrenamiento / 150 validación / 150 prueba). Ojo: el
texto de sus placas lo generó otro modelo (TrOCR), no personas, así que tiene errores. Como no
existe un dataset abierto de placas colombianas con texto, el lector también se entrena con placas
colombianas **sintéticas** (`ml/synth_colombia.py`).

**Métricas (datos nunca vistos al entrenar):**

| Prueba | Resultado |
|---|---|
| Detector, 150 fotos de prueba | precisión 98 %, recall 96 %, mAP@50 97,2 %, mAP@50-95 68,9 %, ~35 ms/imagen |
| Lector, recortes reales (varios países, etiquetas automáticas) | 59,5 % placas exactas, 84,2 % caracteres |
| Lector, placas colombianas sintéticas | 99,8 % placas exactas |
| **Sistema completo, 18 fotos reales de placas colombianas** | **89 % detectadas, 50 % exactas, 75 % caracteres** (motor clásico: 56 % / 17 % / 36 %) |

Las 18 fotos colombianas vienen de un repositorio público sin licencia declarada; se usan solo
localmente para evaluar y no se incluyen en el repositorio.

**Limitaciones.** Los errores típicos son de un carácter (O↔D, W↔N, 3↔5); fallan placas muy sucias o
diminutas, y las de moto (dos renglones) no están soportadas. El conjunto colombiano real es pequeño,
así que sus porcentajes son orientativos.

**Reentrenar** (requiere los datos en `ml/datasets/raw`, ver docstrings de cada script):

```bash
python ml/prepare_detection.py     # 1000 fotos -> formato YOLO
python ml/prepare_ocr.py           # recortes reales + sintéticos
python ml/train_detector.py        # -> backend/models/plate_detector.pt
python ml/train_ocr.py             # -> backend/models/ocr_crnn.pt
python ml/evaluate_and_export.py   # prueba con fotos colombianas -> backend/models/model_card.json
```

## Resultados medidos (escenas simuladas, motor clásico)

Placas leídas exactamente, en escenas que no se usaron al ajustar el detector (100 escenas por dificultad):

| Dificultad | Objetivo | Resultado | Latencia media del detector |
|---|---|---|---|
| Fácil | ≥ 95 % | 100 % | ~43 ms |
| Media | ≥ 90 % | 100 % | ~46 ms |
| Difícil | ≥ 75 % | 95,8 % | ~44 ms |

Una petición completa de detección (incluido guardar imágenes) tarda ~230 ms; un lote de 30 escenas, ~6 s.

## Pruebas

```bash
python -m pytest backend/tests -q
```

71 tests: generador determinista, precisión del detector, todos los endpoints, casos de error y
el motor entrenado (formato colombiano, decodificación CTC y lectura de punta a punta).
Los tests usan un directorio temporal (`PLACAS_DATA_DIR`) y no tocan `data/`.

## Estructura

```
backend/app/
  main.py        API FastAPI (rutas /api/*) y servidor de la interfaz
  generator.py   Generación de escenas sintéticas (Pillow)
  detector.py    Pipeline de detección + OCR (OpenCV/numpy)
  storage.py     SQLite + imágenes en data/
  schemas.py     Modelos Pydantic
  fonts.py       Resolución de la fuente
  ml_models.py   Red CRNN del lector (compartida por entrenamiento e inferencia)
  ml_inference.py  Inferencia con los modelos entrenados (YOLO + CRNN + formato colombiano)
backend/models/  Pesos entrenados (.pt) y ficha de métricas (model_card.json)
backend/tests/   pytest
ml/              Scripts de datos, entrenamiento y evaluación
frontend/        index.html, styles.css, app.js (sin build ni dependencias externas)
docs/ARQUITECTURA.md   Contrato de API y diseño
data/            Generado en ejecución (base de datos e imágenes); ignorado por git
```

La API completa (rutas, campos y formatos) está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Cómo se construyó

El proyecto se hizo por fases con agentes especializados, coordinados por un agente orquestador:

| Fase | Agente | Trabajo |
|---|---|---|
| 0 | Orquestador | Arquitectura y contrato de API |
| 1 | Backend | Generador, detector, API, persistencia y tests |
| 2 | Frontend | Interfaz web (en paralelo, contra el contrato) |
| 3 | QA | Integración de punta a punta en navegador, corrección de nombres de etapas, optimización de lotes |
| 4 | Orquestador | Integración final, documentación y entrega |
