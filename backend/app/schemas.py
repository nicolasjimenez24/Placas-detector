"""Modelos Pydantic v2 del contrato de API (ver docs/ARQUITECTURA.md)."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

PhotoSet = Literal["colombia", "dataset"]
SetFilter = Literal["all", "colombia", "dataset"]


# ----------------------------- Peticiones --------------------------------- #
class DetectRequest(BaseModel):
    photo_id: str = Field(..., min_length=1)


class BatchRequest(BaseModel):
    count: int = Field(20, ge=1, le=50)
    seed: Optional[int] = None
    set: SetFilter = "all"


# ----------------------------- Respuestas --------------------------------- #
class Health(BaseModel):
    status: str = "ok"
    version: str
    model_available: bool


class GroundTruth(BaseModel):
    text: Optional[str] = None             # None: etiqueta ilegible (solo se mide la detección)
    bbox: Optional[list[int]] = None       # None: se desconoce la posición (fotos colombianas)


class Photo(BaseModel):
    id: str
    set: PhotoSet
    image_url: str
    width: int
    height: int
    ground_truth: list[GroundTruth]


class SetInfo(BaseModel):
    nombre: str = ""
    url: str = ""
    licencia: str = ""
    descripcion: str = ""
    nota: str = ""
    photos: int = 0
    plates: int = 0


class GalleryResponse(BaseModel):
    photos: list[Photo]
    sets: dict[str, SetInfo]


class CharConfidence(BaseModel):
    char: str
    confidence: float


class Plate(BaseModel):
    text: str
    confidence: float = Field(..., ge=0, le=1)
    bbox: list[int]
    chars: list[CharConfidence]
    crop_url: str
    valid_format: bool                          # cumple el formato colombiano ABC123
    raw_text: Optional[str] = None              # lectura del CRNN antes del formato colombiano
    detection_confidence: Optional[float] = None  # confianza del detector YOLO


class Stage(BaseModel):
    name: str
    ms: float


class Evaluation(BaseModel):
    expected: int        # placas esperadas en la foto
    matched: int         # esperadas que se localizaron
    readable: int        # esperadas con texto conocido (las que cuentan para la lectura)
    exact_matches: int   # de las legibles, leídas exactamente
    char_accuracy: float  # media sobre las legibles (1 - distancia de edición / longitud)
    correct: bool        # todas localizadas, todas las legibles exactas y sin falsos positivos


class Detection(BaseModel):
    id: str
    photo_id: Optional[str] = None
    photo_set: Optional[PhotoSet] = None
    source: Literal["gallery", "upload"]
    image_url: str
    annotated_url: str
    width: int
    height: int
    plates: list[Plate]
    ground_truth: Optional[list[GroundTruth]] = None
    evaluation: Optional[Evaluation] = None
    processing_ms: float
    stages: list[Stage]
    created_at: str


class SetMetrics(BaseModel):
    detections: int = 0
    plate_accuracy: float = 0.0
    char_accuracy: float = 0.0
    detection_rate: float = 0.0
    avg_processing_ms: float = 0.0


class Metrics(BaseModel):
    total_detections: int = 0
    total_plates: int = 0
    plate_accuracy: float = 0.0
    char_accuracy: float = 0.0
    detection_rate: float = 0.0
    avg_confidence: float = 0.0
    avg_processing_ms: float = 0.0
    by_set: dict[str, SetMetrics]


class BatchResponse(BaseModel):
    results: list[Detection]
    metrics: Metrics


class HistoryResponse(BaseModel):
    detections: list[Detection]


class DeleteResponse(BaseModel):
    deleted: int
