"""API FastAPI de PlacaVision.

Arranque (desde la raíz del proyecto)::

    python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import detector
from .generator import DIFFICULTIES, generate_scene
from .schemas import (BatchRequest, BatchResponse, DeleteResponse, Detection, DetectRequest,
                      Health, HistoryResponse, Metrics, ScenesResponse, SimulateRequest,
                      SimulateResponse)
from .storage import PROJECT_ROOT, get_storage

VERSION = "1.0.0"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
MAX_UPLOAD_SIDE = 2000
IOU_MATCH = 0.3
# Pool para lotes: con 4 hilos el tiempo total es igual que con 8 y la latencia por imagen
# no se infla por contención del GIL (medido: 68 ms vs ~200 ms por imagen).
_POOL = ThreadPoolExecutor(max_workers=max(2, min(4, (os.cpu_count() or 2))), thread_name_prefix="placas")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    detector.warmup()  # plantillas OCR en memoria
    get_storage()
    yield


app = FastAPI(title="PlacaVision API", version=VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(RequestValidationError)
async def _validation_handler(_request: Request, exc: RequestValidationError):
    parts = []
    for err in exc.errors():
        loc = ".".join(str(x) for x in err.get("loc", ()) if x != "body")
        parts.append(f"{loc}: {err.get('msg')}" if loc else str(err.get("msg")))
    return JSONResponse(status_code=422, content={"detail": "; ".join(parts) or "Petición inválida"})


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _iou(a, b) -> float:
    return detector._iou(a, b)


def _char_accuracy(gt: str, pred: str) -> float:
    g, p = gt.replace("-", ""), pred.replace("-", "")
    if not g and not p:
        return 1.0
    return sum(1 for x, y in zip(g, p) if x == y) / max(len(g), len(p))


def evaluate(plates: list[dict], ground_truth: list[dict]) -> dict:
    """Empareja predicciones y ground truth (IoU >= 0.3, voraz por IoU descendente)."""
    pairs = sorted(
        ((_iou(g["bbox"], p["bbox"]), gi, pi)
         for gi, g in enumerate(ground_truth) for pi, p in enumerate(plates)),
        reverse=True,
    )
    used_g, used_p, matches = set(), set(), []
    for iou, gi, pi in pairs:
        if iou < IOU_MATCH:
            break
        if gi in used_g or pi in used_p:
            continue
        used_g.add(gi)
        used_p.add(pi)
        matches.append((gi, pi))
    exact = sum(1 for gi, pi in matches if plates[pi]["text"] == ground_truth[gi]["text"])
    char_sum = sum(_char_accuracy(ground_truth[gi]["text"], plates[pi]["text"]) for gi, pi in matches)
    expected = len(ground_truth)
    return {
        "matched": len(matches),
        "expected": expected,
        "exact_matches": exact,
        "char_accuracy": round(char_sum / expected, 4) if expected else (1.0 if not plates else 0.0),
        "correct": exact == expected and len(plates) == expected,
    }


def compute_metrics(detections: list[dict]) -> dict:
    def summarize(dets: list[dict]) -> dict:
        evals = [d["evaluation"] for d in dets if d.get("evaluation")]
        expected = sum(e["expected"] for e in evals)
        exact = sum(e["exact_matches"] for e in evals)
        matched = sum(e["matched"] for e in evals)
        char_w = sum(e["char_accuracy"] * e["expected"] for e in evals)
        return {
            "detections": len(dets),
            "plate_accuracy": round(exact / expected, 4) if expected else 0.0,
            "char_accuracy": round(char_w / expected, 4) if expected else 0.0,
            "detection_rate": round(matched / expected, 4) if expected else 0.0,
            "avg_processing_ms": round(float(np.mean([d["processing_ms"] for d in dets])), 3) if dets else 0.0,
        }

    overall = summarize(detections)
    confs = [p["confidence"] for d in detections for p in d["plates"]]
    return {
        "total_detections": len(detections),
        "total_plates": len(confs),
        "plate_accuracy": overall["plate_accuracy"],
        "char_accuracy": overall["char_accuracy"],
        "detection_rate": overall["detection_rate"],
        "avg_confidence": round(float(np.mean(confs)), 4) if confs else 0.0,
        "avg_processing_ms": overall["avg_processing_ms"],
        "by_difficulty": {
            diff: summarize([d for d in detections if d.get("difficulty") == diff]) for diff in DIFFICULTIES
        },
    }


def _create_scene(seed: int | None, difficulty: str) -> dict:
    return _create_scene_with_image(seed, difficulty)[0]


def _create_scene_with_image(seed: int | None, difficulty: str) -> tuple[dict, np.ndarray]:
    """Genera y persiste una escena; devuelve también la imagen BGR en memoria."""
    st = get_storage()
    gen = generate_scene(seed, difficulty)
    scene_id = _new_id()
    filename = f"scene_{scene_id}.png"
    bgr = cv2.cvtColor(np.asarray(gen.image), cv2.COLOR_RGB2BGR)
    st.save_image(filename, bgr)
    scene = {
        "id": scene_id,
        "image_url": f"/api/images/{filename}",
        "width": gen.image.width,
        "height": gen.image.height,
        "difficulty": difficulty,
        "ground_truth": gen.ground_truth,
        "created_at": _now(),
    }
    st.add_scene(scene, filename, gen.seed)
    return scene, bgr


def _run_detection(img: np.ndarray, *, source: str, image_filename: str, scene: dict | None) -> dict:
    st = get_storage()
    det_id = _new_id()
    res = detector.detect(img)
    plates = []
    for k, p in enumerate(res.plates):
        crop_name = f"det_{det_id}_plate{k}.png"
        st.save_image(crop_name, p.crop)
        plates.append({
            "text": p.text,
            "confidence": float(p.confidence),
            "bbox": [int(v) for v in p.bbox],
            "chars": [{"char": c.char, "confidence": float(c.confidence)} for c in p.chars],
            "crop_url": f"/api/images/{crop_name}",
            "valid_format": bool(p.valid_format),
        })
    annotated_name = f"det_{det_id}_annotated.png"
    st.save_image(annotated_name, res.annotated)
    gt = scene["ground_truth"] if scene else None
    det = {
        "id": det_id,
        "scene_id": scene["id"] if scene else None,
        "source": source,
        "image_url": f"/api/images/{image_filename}",
        "annotated_url": f"/api/images/{annotated_name}",
        "width": res.width,
        "height": res.height,
        "difficulty": scene["difficulty"] if scene else None,
        "plates": plates,
        "ground_truth": gt,
        "evaluation": evaluate(plates, gt) if gt is not None else None,
        "processing_ms": res.processing_ms,
        "stages": res.stages,
        "created_at": _now(),
    }
    Detection.model_validate(det)
    st.add_detection(det)
    return det


def _detect_scene(scene_id: str) -> dict:
    st = get_storage()
    scene = st.get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Escena '{scene_id}' no encontrada")
    filename = scene.pop("_filename")
    img = st.load_image(filename)
    if img is None:
        raise HTTPException(status_code=404, detail=f"Imagen de la escena '{scene_id}' no encontrada")
    return _run_detection(img, source="simulated", image_filename=filename, scene=scene)


def _public_scene(scene: dict) -> dict:
    return {k: v for k, v in scene.items() if not k.startswith("_")}


# --------------------------------------------------------------------------- #
# Rutas /api
# --------------------------------------------------------------------------- #
@app.get("/api/health", response_model=Health)
def health():
    return {"status": "ok", "version": VERSION}


@app.post("/api/simulate", response_model=SimulateResponse)
def simulate(req: SimulateRequest):
    seeds = [None if req.seed is None else req.seed + i for i in range(req.count)]
    scenes = list(_POOL.map(lambda sd: _create_scene(sd, req.difficulty), seeds))
    return {"scenes": scenes}


@app.post("/api/detect", response_model=Detection)
def detect_scene(req: DetectRequest):
    return _detect_scene(req.scene_id)


@app.post("/api/detect/upload", response_model=Detection)
async def detect_upload(file: UploadFile = File(...)):
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="El archivo supera el máximo de 15 MB")
    img = None
    if data:
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None or img.size == 0:
        raise HTTPException(status_code=400, detail="El archivo no es una imagen válida (PNG o JPG)")
    h, w = img.shape[:2]
    if max(h, w) > MAX_UPLOAD_SIDE:
        f = MAX_UPLOAD_SIDE / max(h, w)
        img = cv2.resize(img, (int(w * f), int(h * f)), interpolation=cv2.INTER_AREA)
    st = get_storage()
    filename = f"upload_{_new_id()}.png"
    st.save_image(filename, img)
    return _run_detection(img, source="upload", image_filename=filename, scene=None)


@app.post("/api/detect/batch", response_model=BatchResponse)
def detect_batch(req: BatchRequest):
    def one(seed: int | None) -> dict:
        scene, bgr = _create_scene_with_image(seed, req.difficulty)
        filename = scene["image_url"].rsplit("/", 1)[-1]
        return _run_detection(bgr, source="simulated", image_filename=filename, scene=scene)

    seeds = [None if req.seed is None else req.seed + i for i in range(req.count)]
    results = list(_POOL.map(one, seeds))
    return {"results": results, "metrics": compute_metrics(results)}


@app.get("/api/scenes", response_model=ScenesResponse)
def list_scenes(limit: int = Query(50, ge=1, le=1000)):
    return {"scenes": [_public_scene(s) for s in get_storage().list_scenes(limit)]}


@app.get("/api/history", response_model=HistoryResponse)
def history(limit: int = Query(50, ge=1, le=1000)):
    return {"detections": get_storage().list_detections(limit)}


@app.get("/api/history/{detection_id}", response_model=Detection)
def history_item(detection_id: str):
    det = get_storage().get_detection(detection_id)
    if det is None:
        raise HTTPException(status_code=404, detail=f"Detección '{detection_id}' no encontrada")
    return det


@app.delete("/api/history", response_model=DeleteResponse)
def clear_history():
    return {"deleted": get_storage().clear()}


@app.get("/api/stats", response_model=Metrics)
def stats():
    return compute_metrics(get_storage().list_detections(None))


@app.get("/api/images/{filename}")
def get_image(filename: str):
    path = get_storage().image_path(filename) if filename.endswith(".png") else None
    if path is None:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"], include_in_schema=False)
def api_not_found(rest: str):
    raise HTTPException(status_code=404, detail=f"Ruta /api/{rest} no encontrada")


# --------------------------------------------------------------------------- #
# Frontend estático (montado DESPUÉS de las rutas /api)
# --------------------------------------------------------------------------- #
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
