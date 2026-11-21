"""Modelos Pydantic v2 del contrato de API (ver docs/ARQUITECTURA.md)."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Difficulty = Literal["easy", "medium", "hard"]
# "clasico": visión por computador de la v1 (placas simuladas). "ml": modelos entrenados (fotos reales).
Engine = Literal["clasico", "ml"]


# ----------------------------- Peticiones --------------------------------- #
class SimulateRequest(BaseModel):
    count: int = Field(1, ge=1, le=12)
    seed: Optional[int] = None
    difficulty: Difficulty = "medium"


class DetectRequest(BaseModel):
    scene_id: str = Field(..., min_length=1)
    engine: Engine = "clasico"


class BatchRequest(BaseModel):
    count: int = Field(10, ge=1, le=50)
    seed: Optional[int] = None
    difficulty: Difficulty = "medium"


# ----------------------------- Respuestas --------------------------------- #
class Health(BaseModel):
    status: str = "ok"
    version: str


class GroundTruth(BaseModel):
    text: str
    bbox: list[int]


class Scene(BaseModel):
    id: str
    image_url: str
    width: int
    height: int
    difficulty: str
    ground_truth: list[GroundTruth]
    created_at: str


class CharConfidence(BaseModel):
    char: str
    confidence: float


class Plate(BaseModel):
    text: str
    confidence: float = Field(..., ge=0, le=1)
    bbox: list[int]
    chars: list[CharConfidence]
    crop_url: str
    valid_format: bool
    raw_text: Optional[str] = None              # solo motor "ml": lectura antes del formato colombiano
    detection_confidence: Optional[float] = None  # solo motor "ml": confianza del detector YOLO


class Stage(BaseModel):
    name: str
    ms: float


class Evaluation(BaseModel):
    matched: int
    expected: int
    exact_matches: int
    char_accuracy: float
    correct: bool


class Detection(BaseModel):
    id: str
    scene_id: Optional[str] = None
    source: Literal["simulated", "upload"]
    engine: Engine = "clasico"
    image_url: str
    annotated_url: str
    width: int
    height: int
    difficulty: Optional[str] = None
    plates: list[Plate]
    ground_truth: Optional[list[GroundTruth]] = None
    evaluation: Optional[Evaluation] = None
    processing_ms: float
    stages: list[Stage]
    created_at: str


class DiffMetrics(BaseModel):
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
    by_difficulty: dict[str, DiffMetrics]


class SimulateResponse(BaseModel):
    scenes: list[Scene]


class ScenesResponse(BaseModel):
    scenes: list[Scene]


class BatchResponse(BaseModel):
    results: list[Detection]
    metrics: Metrics


class HistoryResponse(BaseModel):
    detections: list[Detection]


class DeleteResponse(BaseModel):
    deleted: int
