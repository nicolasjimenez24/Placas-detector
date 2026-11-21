"""Inferencia con los modelos ENTRENADOS (fotos reales): detector YOLO + lector CRNN.

Pipeline:
  1. YOLO11n ajustado encuentra las placas (recuadro + confianza).
  2. Se recorta cada placa con un pequeño margen.
  3. El CRNN lee el texto del recorte (decodificación CTC).
  4. Posprocesado colombiano: placa de carro = 3 letras + 3 números (ABC123). Si la lectura
     tiene 6 caracteres se corrigen confusiones según la posición (0->O en zona de letras,
     O->0 en zona de números, etc.). Si es más larga (p. ej. leyó parte del municipio), se busca
     la subcadena de 6 que encaje con el formato.

Devuelve el mismo DetectionResult que el detector clásico para reutilizar la API.
"""
from __future__ import annotations

import re
import threading
import time
from pathlib import Path

import cv2
import numpy as np

from .detector import CharResult, DetectionResult, PlateResult, annotate

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DETECTOR_PATH = MODELS_DIR / "plate_detector.pt"
OCR_PATH = MODELS_DIR / "ocr_crnn.pt"

DET_CONF = 0.35
DET_IMGSZ = 416
CO_PLATE = re.compile(r"^[A-Z]{3}\d{3}$")
TO_DIGIT = {"O": "0", "D": "0", "Q": "0", "U": "0", "I": "1", "L": "1", "T": "1", "J": "1",
            "Z": "2", "S": "5", "B": "8", "G": "6", "A": "4"}
TO_LETTER = {"0": "O", "1": "I", "2": "Z", "4": "A", "5": "S", "6": "G", "7": "T", "8": "B"}

_lock = threading.Lock()
_models: dict = {}


def available() -> bool:
    return DETECTOR_PATH.is_file() and OCR_PATH.is_file()


def _load():
    with _lock:
        if not _models:
            import torch
            from ultralytics import YOLO

            from .ml_models import CRNN

            torch.set_num_threads(4)
            ocr = CRNN()
            ckpt = torch.load(OCR_PATH, map_location="cpu", weights_only=True)
            ocr.load_state_dict(ckpt["state_dict"])
            ocr.eval()
            _models["det"] = YOLO(str(DETECTOR_PATH), task="detect")
            _models["ocr"] = ocr
    return _models["det"], _models["ocr"]


def warmup() -> None:
    if available():
        det, _ = _load()
        det.predict(np.zeros((320, 320, 3), np.uint8), imgsz=DET_IMGSZ, device="cpu", verbose=False)


PAD_FACTOR = 1.0  # en la segunda escala la foto ocupa 1/3 del lienzo
CAND_CONF = 0.15  # umbral bajo para candidatos; se filtran luego con el formato colombiano


def _yolo(det_model, img: np.ndarray, conf: float = DET_CONF) -> tuple[np.ndarray, np.ndarray]:
    res = det_model.predict(img, imgsz=DET_IMGSZ, conf=conf, device="cpu", verbose=False)[0]
    if res.boxes is None or len(res.boxes) == 0:
        return np.zeros((0, 4), np.float32), np.zeros(0, np.float32)
    return res.boxes.xyxy.cpu().numpy(), res.boxes.conf.cpu().numpy()


def _nms(boxes: np.ndarray, conf: np.ndarray, iou: float) -> tuple[np.ndarray, np.ndarray]:
    if len(boxes) == 0:
        return boxes, conf
    xywh = [[float(a), float(b), float(c - a), float(d - b)] for a, b, c, d in boxes]
    keep = cv2.dnn.NMSBoxes(xywh, conf.astype(float).tolist(), 0.0, iou)
    keep = np.array(keep).reshape(-1)
    return boxes[keep], conf[keep]


def _overlap_small(a: list[int], b: list[int]) -> float:
    """Intersección dividida por el área de la caja más pequeña (cajas x, y, w, h)."""
    ix = max(0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    small = min(a[2] * a[3], b[2] * b[3])
    return ix * iy / small if small else 0.0


def colombian_format(raw: str, confs: list[float]) -> tuple[str, list[float], bool]:
    """Ajusta la lectura al formato ABC123. Devuelve (texto, confianzas, es_válido)."""
    def fix(s: str) -> str:
        return "".join(TO_LETTER.get(c, c) for c in s[:3]) + "".join(TO_DIGIT.get(c, c) for c in s[3:])

    if CO_PLATE.match(raw):
        return raw, confs, True
    windows = [(i, raw[i:i + 6]) for i in range(0, max(1, len(raw) - 5))] if len(raw) >= 6 else []
    for i, w in windows:  # primero sin corregir, luego corrigiendo confusiones
        if CO_PLATE.match(w):
            return w, confs[i:i + 6], True
    for i, w in windows:
        f = fix(w)
        if CO_PLATE.match(f):
            return f, confs[i:i + 6], True
    return raw, confs, False


def detect(img: np.ndarray) -> DetectionResult:
    import torch

    from .ml_models import greedy_decode, preprocess

    det_model, ocr = _load()
    t_start = time.perf_counter()
    stages = []

    def mark(name: str, t0: float) -> float:
        now = time.perf_counter()
        stages.append({"name": name, "ms": round((now - t0) * 1000, 3)})
        return now

    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    elif img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    H, W = img.shape[:2]

    t = time.perf_counter()
    # Multiescala: el detector se entrenó con fotos de tráfico (placas pequeñas). En un primer
    # plano la placa ocupa casi toda la foto, así que también se busca con la foto puesta en un
    # lienzo mayor. Los candidatos de ambas escalas se unen (NMS) en coordenadas originales.
    boxes, det_conf = _yolo(det_model, img, CAND_CONF)
    pad_y, pad_x = int(H * PAD_FACTOR), int(W * PAD_FACTOR)
    canvas = cv2.copyMakeBorder(img, pad_y, pad_y, pad_x, pad_x, cv2.BORDER_CONSTANT, value=(114, 114, 114))
    b2, c2 = _yolo(det_model, canvas, CAND_CONF)
    if len(b2):
        b2 = np.clip(b2 - np.array([pad_x, pad_y, pad_x, pad_y], dtype=b2.dtype), 0, [W, H, W, H])
        boxes, det_conf = np.vstack([boxes, b2]), np.concatenate([det_conf, c2])
    boxes, det_conf = _nms(boxes, det_conf, 0.5)
    t = mark("yolo_deteccion", t)

    cands = []  # (caja, confianza, recorte)
    for (x0, y0, x1, y1), conf in zip(boxes, det_conf):
        bw, bh = x1 - x0, y1 - y0
        mx, my = bw * 0.06, bh * 0.12
        cx0, cy0 = int(max(0, x0 - mx)), int(max(0, y0 - my))
        cx1, cy1 = int(min(W, x1 + mx)), int(min(H, y1 + my))
        if cx1 - cx0 < 8 or cy1 - cy0 < 4:
            continue
        cands.append(((int(x0), int(y0), int(x1), int(y1)), float(conf), img[cy0:cy1, cx0:cx1].copy()))
    t = mark("recorte", t)

    reads = []
    if cands:
        batch = torch.stack([preprocess(cv2.cvtColor(c[2], cv2.COLOR_BGR2RGB)) for c in cands])
        with torch.no_grad():
            reads = greedy_decode(ocr(batch))
    t = mark("crnn_lectura", t)

    plates: list[PlateResult] = []
    for (raw, confs), ((x0, y0, x1, y1), dconf, crop) in zip(reads, cands):
        text, ch_conf, valid = colombian_format(raw, confs)
        # candidatos dudosos del detector solo se aceptan si su lectura tiene formato de placa
        if dconf < DET_CONF and not valid:
            continue
        ocr_conf = float(np.mean(ch_conf)) if ch_conf else 0.0
        poly = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], dtype=np.float32)
        p = PlateResult(text=text or "?", confidence=dconf * ocr_conf,
                        bbox=[x0, y0, x1 - x0, y1 - y0],
                        chars=[CharResult(c, float(cf)) for c, cf in zip(text, ch_conf)],
                        valid_format=valid, crop=crop, polygon=poly)
        p.raw_text = raw  # lectura sin posprocesar (informativa)
        p.detection_confidence = dconf
        plates.append(p)
    # una lectura sin formato que se solapa con una válida suele ser parte de la misma placa
    # (p. ej. el renglón del municipio en un primer plano): se descarta
    valid_boxes = [p.bbox for p in plates if p.valid_format]
    plates = [p for p in plates if p.valid_format or not any(_overlap_small(p.bbox, vb) > 0.3 for vb in valid_boxes)]
    plates.sort(key=lambda p: (p.bbox[1], p.bbox[0]))
    t = mark("formato_colombiano", t)

    annotated = annotate(img, plates)
    mark("anotacion", t)
    return DetectionResult(plates=plates, annotated=annotated, stages=stages,
                           processing_ms=round((time.perf_counter() - t_start) * 1000, 3), width=W, height=H)
