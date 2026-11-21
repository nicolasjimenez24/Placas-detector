# PlacaVision — Detector de placas vehiculares (datos simulados)

Sistema completo que **genera imágenes sintéticas** de tráfico y **detecta y lee las placas** de cada
vehículo con un pipeline de visión por computador (OpenCV + OCR por plantillas). Incluye una API REST
(FastAPI), historial en SQLite y una interfaz web en español.

> Todos los datos son simulados: las placas tienen formato ficticio `AAA-123` y no corresponden a vehículos reales.

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
| **Subir imagen** | Analiza un PNG/JPG propio (arrastrar y soltar). |
| **Evaluación por lotes** | Genera y procesa hasta 50 escenas; muestra precisión, latencia, histogramas y tabla con filtro de errores. |
| **Historial** | Todas las detecciones guardadas, con búsqueda y filtros; permite borrar el historial. |
| **Estadísticas** | Métricas acumuladas y comparativa por dificultad. |

Atajos: `G` generar, `A` detectar todas, `1`–`5` cambiar de sección, `?` ayuda.

## Cómo funciona la detección

1. Conversión a HSV y máscara del color amarillo de la placa.
2. Contornos candidatos filtrados por área, proporción y rectangularidad (descarta, p. ej., taxis amarillos).
3. Enderezado del recorte con `minAreaRect`.
4. Binarización y segmentación de caracteres por componentes conectados.
5. OCR por *template matching* contra glifos renderizados con la misma fuente.
6. Validación del formato `AAA-123` con corrección de confusiones según la posición (0↔D, 8↔B, 5↔S…).

El detector **nunca** usa el valor esperado: solo recibe la imagen. El valor esperado sirve únicamente para medir la precisión.

## Resultados medidos

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

59 tests: generador determinista, precisión del detector, todos los endpoints y casos de error.
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
backend/tests/   pytest
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
