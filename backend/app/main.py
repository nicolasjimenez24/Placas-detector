"""API FastAPI de PlacaVision: detección de placas en fotos reales con el modelo entrenado.

Arranque (desde la raíz del proyecto)::

    python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import json
import re
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import auth, gallery, ml_inference
from .results import iou
from .schemas import (BatchRequest, BatchResponse, DeleteResponse, Detection, DetectRequest,
                      GalleryResponse, Health, HistoryResponse, Metrics, SetFilter)
from .storage import PROJECT_ROOT, get_storage

VERSION = "2.0.0"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
MAX_UPLOAD_SIDE = 2000
IOU_MATCH = 0.3


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # los modelos (PyTorch) tardan unos segundos en cargar: se precargan en segundo plano
    threading.Thread(target=ml_inference.warmup, daemon=True).start()
    get_storage()
    yield


app = FastAPI(title="PlacaVision API", version=VERSION, lifespan=lifespan)
# Mismo origen (la interfaz la sirve este servidor): no hace falta CORS abierto, y con cookies de sesión
# sería un riesgo. Solo se permite el propio servidor en desarrollo local.
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def _require_session(request: Request, call_next):
    """Toda la API (salvo salud y login) exige una sesión iniciada."""
    if not auth.is_public(request.url.path):
        user = auth.current_user(request)
        if user is None:
            return JSONResponse(status_code=401, content={"detail": "Inicia sesión para usar PlacaVision."})
        request.state.user = user
    return await call_next(request)


app.include_router(auth.router)


@app.exception_handler(RequestValidationError)
async def _validation_handler(_request: Request, exc: RequestValidationError):
    parts = []
    for err in exc.errors():
        loc = ".".join(str(x) for x in err.get("loc", ()) if x != "body")
        parts.append(f"{loc}: {err.get('msg')}" if loc else str(err.get("msg")))
    return JSONResponse(status_code=422, content={"detail": "; ".join(parts) or "Petición inválida"})


# --------------------------------------------------------------------------- #
# Evaluación contra el valor esperado
# --------------------------------------------------------------------------- #
def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def norm_text(t: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (t or "").upper())


def levenshtein(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def char_accuracy(gt: str, pred: str) -> float:
    g, p = norm_text(gt), norm_text(pred)
    return max(0.0, 1 - levenshtein(p, g) / len(g)) if g else 0.0


def match_plates(plates: list[dict], ground_truth: list[dict]) -> list[tuple[int, int]]:
    """Empareja (índice esperado, índice detectado).

    Las esperadas con caja se emparejan por IoU >= 0.3 (voraz, mayor IoU primero). Las que no
    tienen caja (fotos colombianas) se emparejan con la detección restante cuya lectura se
    parezca más a su texto.
    """
    used_g, used_p, pairs = set(), set(), []
    cands = sorted(((iou(g["bbox"], p["bbox"]), gi, pi)
                    for gi, g in enumerate(ground_truth) if g.get("bbox")
                    for pi, p in enumerate(plates)), reverse=True)
    for v, gi, pi in cands:
        if v < IOU_MATCH:
            break
        if gi not in used_g and pi not in used_p:
            used_g.add(gi), used_p.add(pi), pairs.append((gi, pi))
    for gi, g in enumerate(ground_truth):
        if g.get("bbox") or gi in used_g:
            continue
        free = [pi for pi in range(len(plates)) if pi not in used_p]
        if not free:
            break
        pi = min(free, key=lambda k: levenshtein(norm_text(plates[k]["text"]), norm_text(g.get("text"))))
        used_g.add(gi), used_p.add(pi), pairs.append((gi, pi))
    return pairs


def evaluate(plates: list[dict], ground_truth: list[dict]) -> dict:
    pairs = dict(match_plates(plates, ground_truth))
    readable = [gi for gi, g in enumerate(ground_truth) if g.get("text")]
    exact, chars = 0, 0.0
    for gi in readable:
        if gi in pairs:
            pred = plates[pairs[gi]]["text"]
            exact += norm_text(pred) == ground_truth[gi]["text"]
            chars += char_accuracy(ground_truth[gi]["text"], pred)
    expected = len(ground_truth)
    return {
        "expected": expected,
        "matched": len(pairs),
        "readable": len(readable),
        "exact_matches": exact,
        "char_accuracy": round(chars / len(readable), 4) if readable else 0.0,
        "correct": len(pairs) == expected and exact == len(readable) and len(plates) == len(pairs),
    }


def compute_metrics(detections: list[dict]) -> dict:
    def summarize(dets: list[dict]) -> dict:
        evals = [d["evaluation"] for d in dets if d.get("evaluation")]
        expected = sum(e["expected"] for e in evals)
        readable = sum(e["readable"] for e in evals)
        return {
            "detections": len(dets),
            "plate_accuracy": round(sum(e["exact_matches"] for e in evals) / readable, 4) if readable else 0.0,
            "char_accuracy": round(sum(e["char_accuracy"] * e["readable"] for e in evals) / readable, 4) if readable else 0.0,
            "detection_rate": round(sum(e["matched"] for e in evals) / expected, 4) if expected else 0.0,
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
        "by_set": {s: summarize([d for d in detections if d.get("photo_set") == s]) for s in gallery.SETS},
    }


# --------------------------------------------------------------------------- #
# Detección
# --------------------------------------------------------------------------- #
def _require_model() -> None:
    if not ml_inference.available():
        raise HTTPException(status_code=503, detail="El modelo entrenado no está disponible: entrénalo con los scripts de ml/")


def _run_detection(img: np.ndarray, *, image_url: str, photo: dict | None) -> dict:
    st = get_storage()
    det_id = _new_id()
    res = ml_inference.detect(img)
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
            "raw_text": p.raw_text,
            "detection_confidence": p.detection_confidence,
        })
    annotated_name = f"det_{det_id}_annotated.png"
    st.save_image(annotated_name, res.annotated)
    gt = photo["ground_truth"] if photo else None
    det = {
        "id": det_id,
        "photo_id": photo["id"] if photo else None,
        "photo_set": photo["set"] if photo else None,
        "source": "gallery" if photo else "upload",
        "image_url": image_url,
        "annotated_url": f"/api/images/{annotated_name}",
        "width": res.width,
        "height": res.height,
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


def _detect_photo(photo: dict) -> dict:
    img = cv2.imdecode(np.fromfile(str(gallery.photo_path(photo)), np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=500, detail=f"No se pudo leer la foto '{photo['id']}'")
    return _run_detection(img, image_url=gallery.public(photo)["image_url"], photo=photo)


# --------------------------------------------------------------------------- #
# Rutas /api
# --------------------------------------------------------------------------- #
@app.get("/api/health", response_model=Health)
def health():
    return {"status": "ok", "version": VERSION, "model_available": ml_inference.available()}


@app.get("/api/gallery", response_model=GalleryResponse)
def list_gallery(set: SetFilter = "all"):  # noqa: A002 - nombre del parámetro en la API
    return {"photos": [gallery.public(p) for p in gallery.list_photos(set)], "sets": gallery.sets_info()}


@app.get("/api/gallery/{photo_id}/image")
def gallery_image(photo_id: str):
    photo = gallery.get_photo(photo_id)
    if photo is None:
        raise HTTPException(status_code=404, detail=f"Foto '{photo_id}' no encontrada")
    return FileResponse(gallery.photo_path(photo), media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=86400"})


@app.post("/api/detect", response_model=Detection)
def detect_photo(req: DetectRequest):
    _require_model()
    photo = gallery.get_photo(req.photo_id)
    if photo is None:
        raise HTTPException(status_code=404, detail=f"Foto '{req.photo_id}' no encontrada")
    return _detect_photo(photo)


@app.post("/api/detect/upload", response_model=Detection)
async def detect_upload(file: UploadFile = File(...)):
    _require_model()
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="El archivo supera el máximo de 15 MB")
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR) if data else None
    if img is None or img.size == 0:
        raise HTTPException(status_code=400, detail="El archivo no es una imagen válida (PNG, JPG o WebP)")
    h, w = img.shape[:2]
    if max(h, w) > MAX_UPLOAD_SIDE:
        f = MAX_UPLOAD_SIDE / max(h, w)
        img = cv2.resize(img, (max(1, int(w * f)), max(1, int(h * f))), interpolation=cv2.INTER_AREA)
    filename = f"upload_{_new_id()}.png"
    get_storage().save_image(filename, img)
    return _run_detection(img, image_url=f"/api/images/{filename}", photo=None)


@app.post("/api/detect/batch", response_model=BatchResponse)
def detect_batch(req: BatchRequest):
    _require_model()
    photos = gallery.sample(req.count, req.seed, req.set)
    if not photos:
        raise HTTPException(status_code=404, detail="No hay fotos en la galería para ese conjunto")
    results = [_detect_photo(p) for p in photos]  # el modelo se usa de a una imagen (ver ml_inference)
    return {"results": results, "metrics": compute_metrics(results)}


@app.get("/api/model")
def model_info():
    """Ficha del modelo entrenado: datos, métricas de prueba y curvas de entrenamiento."""
    card_path = ml_inference.MODELS_DIR / "model_card.json"
    card = json.loads(card_path.read_text(encoding="utf-8")) if card_path.is_file() else None
    return {"available": ml_inference.available(), "card": card}


@app.get("/api/report")
def report():
    """Evidencia de validación: evaluación sobre toda la galería y resultado de las pruebas automatizadas."""
    def load(name: str):
        path = ml_inference.MODELS_DIR / name
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None
    return {"gallery": load("gallery_report.json"), "tests": load("test_report.json")}


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
