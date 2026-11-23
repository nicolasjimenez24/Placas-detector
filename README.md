# PlacaVision — Identificación automática de placas vehiculares

Aplicación web que recibe una **foto real** de un vehículo y devuelve el texto de su placa. Encadena
dos redes neuronales entrenadas en este proyecto: un **detector YOLO11n** que encuentra la placa y un
**lector CRNN + CTC** que lee sus caracteres. Cada resultado se compara con el valor esperado de la foto
para medir cuánto acierta. Incluye API REST (FastAPI), inicio de sesión, historial en SQLite e interfaz en español.

## Arranque (Windows)

```bat
run.bat
```

Abre **http://localhost:8000**. La primera vez la aplicación pide **crear la cuenta de administrador**
(usuario y contraseña). Requiere Python 3.10+. Manual, desde la raíz:

```bash
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Más usuarios (p. ej. para quien revise el proyecto):

```bash
python -m backend.app.auth crear-usuario profesor --nombre "Profesor"
python -m backend.app.auth listar
```

## Secciones

| Sección | Qué muestra |
|---|---|
| **Inicio** | Qué hace el modelo, resultados de validación, cómo se construyó y acceso a cada sección |
| **Detector** | Galería de 168 fotos reales; detecta y lee la placa, con confianza por carácter y comparación con lo esperado |
| **Subir imagen** | Foto propia o captura con la cámara |
| **Evaluación por lotes** | Hasta 50 fotos al azar con métricas, histogramas y exportación CSV/JSON |
| **Historial / Estadísticas** | Todas las detecciones, filtros y métricas acumuladas por conjunto |
| **Modelo** | Datos, métricas de prueba, curvas de entrenamiento y un **recorrido paso a paso** de una foto por el pipeline |
| **Pruebas y validación** | Evaluación de las 168 fotos, análisis de errores (IoU, tamaño de placa, calibración, confusiones) y pruebas automatizadas |

## Cómo funciona

```
foto ─> YOLO11n (localiza la placa) ─> recorte ─> CRNN + CTC (lee los caracteres) ─> formato ABC123 ─> evaluación
```

| Pieza | Entrenamiento |
|---|---|
| Detector YOLO11n | Ajustado (preentrenado en COCO) con 700 fotos reales, 15 épocas, 416 px, CPU (~55 min) |
| Lector CRNN + CTC | Desde cero (0,67 M parámetros): recortes reales + 10 000 placas colombianas generadas para aprender el formato, 20 épocas |

**Datos:** [sonnetechnology/license-plate-text-recognition-full](https://huggingface.co/datasets/sonnetechnology/license-plate-text-recognition-full)
(CC BY 4.0), muestra fija de 1 000 fotos (700 / 150 / 150). El texto de sus placas lo generó otro modelo (TrOCR) y tiene errores.
Las 18 fotos de placas colombianas vienen de un repositorio sin licencia declarada: se usan solo localmente y no se suben a git.

## Resultados (168 fotos reales nunca vistas al entrenar)

| Conjunto | Placas localizadas | Lecturas exactas | Caracteres correctos |
|---|---|---|---|
| Todas (168) | 95,9 % | 46,7 % | 67,8 % |
| Colombianas (18, anotadas a mano) | 88,9 % | 50,0 % | 75,0 % |
| Dataset público (150) | 96,7 % | 46,2 % | 66,7 % |

Detector en su partición de prueba: precisión 98 %, recall 96 %, mAP@50 97,2 %. Errores típicos: un solo
carácter (O↔D, W↔N, 3↔5); fallan placas muy pequeñas o borrosas; las de moto (dos renglones) no están soportadas.

## Pruebas

```bash
python -m pytest backend/tests -q        # 54 pruebas: API, modelo, evaluación, base de datos e inicio de sesión
python -m backend.tests.report           # las ejecuta y guarda el informe que muestra la app
python ml/evaluate_gallery.py            # evalúa el modelo en las 168 fotos de la galería
```

## Reentrenar y regenerar datos

Requiere los datos en `ml/datasets/raw` (ver docstrings):

```bash
python ml/prepare_detection.py && python ml/prepare_ocr.py
python ml/train_detector.py && python ml/train_ocr.py
python ml/evaluate_and_export.py     # ficha del modelo (backend/models/model_card.json)
python ml/build_gallery.py           # galería de fotos reales (backend/gallery/)
```

El contrato completo de la API está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
