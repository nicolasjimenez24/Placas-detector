"""Tests del modelo entrenado (detector YOLO + lector CRNN): formato colombiano y decodificación CTC.

Los que necesitan los pesos se omiten si aún no se han entrenado (backend/models/*.pt).
"""
import numpy as np
import pytest
import torch

from backend.app import ml_inference
from backend.app.ml_inference import colombian_format
from backend.app.ml_models import ALPHABET, CRNN, encode, greedy_decode, preprocess



@pytest.mark.parametrize("raw, expected, valid", [
    ("ABC123", "ABC123", True),
    ("A8C123", "ABC123", True),       # 8 en zona de letras -> B
    ("KOOO42", "KOO042", True),       # O en zona de números -> 0
    ("RKW326MEDELLIN", "RKW326", True),  # leyó parte del municipio
    ("XRKW326", "RKW326", True),
    ("12345", "12345", False),         # no encaja con el formato
    ("51F22261", "51F22261", False),   # placa extranjera: no se deforma a "SIF222"
    ("43A18650", "43A18650", False),
    ("515553", "515553", False),       # necesitaría 3 cambios: no se fuerza
])
def test_colombian_format(raw, expected, valid):
    text, confs, ok = colombian_format(raw, [0.9] * len(raw))
    assert (text, ok) == (expected, valid)
    assert len(confs) == len(text) or not ok


def test_crnn_shapes_and_decode():
    m = CRNN().eval()
    x = torch.stack([preprocess(np.full((40, 140, 3), v, np.uint8)) for v in (30, 200)])
    with torch.no_grad():
        out = m(x)
    assert out.shape == (2, 32, len(ALPHABET) + 1)
    for text, confs in greedy_decode(out):
        assert set(text) <= set(ALPHABET) and len(confs) == len(text)
    assert encode("AB1") == [11, 12, 2]


def test_greedy_decode_ctc_rules():
    # secuencia: A A blank A B -> "AAB" (el blanco separa letras repetidas)
    seq = [11, 11, 0, 11, 12]
    logits = torch.full((1, len(seq), len(ALPHABET) + 1), -10.0)
    for t, i in enumerate(seq):
        logits[0, t, i] = 10.0
    assert greedy_decode(logits)[0][0] == "AAB"


def test_model_endpoint(client):
    r = client.get("/api/model")
    assert r.status_code == 200
    d = r.json()
    assert d["available"] == ml_inference.available()
    assert d["card"] is None or {"detector", "ocr", "dataset"} <= set(d["card"])


def test_overlapping_boxes_keep_most_confident(monkeypatch):
    """Dos cajas sobre la misma placa: solo queda la de mayor confianza (evita falsos positivos)."""
    import numpy as np

    boxes = np.array([[100, 100, 300, 160], [180, 140, 260, 158], [500, 100, 700, 160]], np.float32)
    confs = np.array([0.8, 0.1, 0.7], np.float32)
    # el NMS ordena por confianza: se leen en el orden 0.8, 0.7, 0.1
    reads = iter([("RJV247", [0.9] * 6), ("KOO042", [0.9] * 6), ("UTL471", [0.9] * 6)])
    monkeypatch.setattr(ml_inference, "_load", lambda: (None, lambda batch: batch))
    calls = iter([(boxes, confs), (np.zeros((0, 4), np.float32), np.zeros(0, np.float32))])
    monkeypatch.setattr(ml_inference, "_yolo", lambda *a, **k: next(calls))
    import backend.app.ml_models as mm
    monkeypatch.setattr(mm, "preprocess", lambda img: torch.zeros(1, 32, 128))
    monkeypatch.setattr(mm, "greedy_decode", lambda out: [next(reads) for _ in range(len(out))])
    res = ml_inference.detect(np.zeros((400, 800, 3), np.uint8))
    assert [p.text for p in res.plates] == ["RJV247", "KOO042"]
