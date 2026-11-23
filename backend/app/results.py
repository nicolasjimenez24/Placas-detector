"""Estructuras de resultado de la detección y utilidades comunes (anotación, IoU)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np


@dataclass
class CharResult:
    char: str
    confidence: float


@dataclass
class PlateResult:
    text: str
    confidence: float
    bbox: list[int]  # x, y, ancho, alto
    chars: list[CharResult]
    valid_format: bool
    crop: np.ndarray  # BGR
    raw_text: Optional[str] = None  # lectura del CRNN antes del formato colombiano
    detection_confidence: Optional[float] = None  # confianza del detector YOLO


@dataclass
class DetectionResult:
    plates: list[PlateResult]
    annotated: np.ndarray  # BGR
    stages: list[dict] = field(default_factory=list)
    processing_ms: float = 0.0
    width: int = 0
    height: int = 0


def iou(a, b) -> float:
    """IoU de dos cajas (x, y, ancho, alto)."""
    ax0, ay0, aw, ah = a
    bx0, by0, bw, bh = b
    ix = max(0, min(ax0 + aw, bx0 + bw) - max(ax0, bx0))
    iy = max(0, min(ay0 + ah, by0 + bh) - max(ay0, by0))
    inter = ix * iy
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def annotate(img: np.ndarray, plates: list[PlateResult]) -> np.ndarray:
    """Dibuja la caja y la lectura de cada placa (verde: formato válido; naranja: no)."""
    out = img.copy()
    H, W = out.shape[:2]
    scale = max(0.5, min(1.2, W / 1400))
    thick = max(2, round(W / 600))
    for p in plates:
        x, y, w, h = p.bbox
        color = (60, 220, 60) if p.valid_format else (0, 200, 255)
        cv2.rectangle(out, (x, y), (x + w, y + h), color, thick)
        label = f"{p.text} {p.confidence * 100:.0f}%"
        (tw, th), base = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, scale, 2)
        ly = y - 6 if y - th - 10 >= 0 else y + h + th + 8
        cv2.rectangle(out, (x, ly - th - 5), (x + tw + 8, ly + base), color, -1)
        cv2.putText(out, label, (x + 4, ly - 2), cv2.FONT_HERSHEY_SIMPLEX, scale, (10, 10, 10), 2, cv2.LINE_AA)
    return out
