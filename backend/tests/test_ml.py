"""Tests del motor con modelos entrenados (detector YOLO + lector CRNN).

Los que necesitan los pesos se omiten si aún no se han entrenado (backend/models/*.pt).
"""
import cv2
import numpy as np
import pytest
import torch

from backend.app import ml_inference
from backend.app.ml_inference import colombian_format
from backend.app.ml_models import ALPHABET, CRNN, encode, greedy_decode, preprocess

needs_models = pytest.mark.skipif(not ml_inference.available(), reason="modelos no entrenados")


@pytest.mark.parametrize("raw, expected, valid", [
    ("ABC123", "ABC123", True),
    ("A8C123", "ABC123", True),       # 8 en zona de letras -> B
    ("KOOO42", "KOO042", True),       # O en zona de números -> 0
    ("RKW326MEDELLIN", "RKW326", True),  # leyó parte del municipio
    ("XRKW326", "RKW326", True),
    ("12345", "12345", False),         # no encaja con el formato
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


def test_upload_invalid_engine(client):
    img = np.full((100, 100, 3), 128, np.uint8)
    ok, png = cv2.imencode(".png", img)
    r = client.post("/api/detect/upload", files={"file": ("a.png", png.tobytes(), "image/png")},
                    data={"engine": "otro"})
    assert r.status_code == 422


def test_ml_engine_unavailable(client, monkeypatch):
    monkeypatch.setattr(ml_inference, "available", lambda: False)
    img = np.full((100, 100, 3), 128, np.uint8)
    ok, png = cv2.imencode(".png", img)
    r = client.post("/api/detect/upload", files={"file": ("a.png", png.tobytes(), "image/png")},
                    data={"engine": "ml"})
    assert r.status_code == 503
    # sin motor explícito cae al clásico
    r = client.post("/api/detect/upload", files={"file": ("a.png", png.tobytes(), "image/png")})
    assert r.status_code == 200 and r.json()["engine"] == "clasico"


@needs_models
def test_ml_engine_reads_synthetic_colombian_plate(client):
    """Una placa colombiana sintética nítida pegada en una foto debe detectarse y leerse."""
    import random
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ml"))
    from synth_colombia import render_plate

    plate = np.asarray(render_plate("KDF482", random.Random(3)).resize((231, 112)))
    scene = np.full((480, 640, 3), (90, 95, 100), np.uint8)
    cv2.rectangle(scene, (150, 150), (490, 420), (40, 40, 160), -1)  # "carro"
    scene[300:412, 205:436] = plate[:, :, ::-1]
    ok, jpg = cv2.imencode(".jpg", scene)
    r = client.post("/api/detect/upload", files={"file": ("carro.jpg", jpg.tobytes(), "image/jpeg")},
                    data={"engine": "ml"})
    assert r.status_code == 200
    d = r.json()
    assert d["engine"] == "ml" and d["plates"], "no detectó la placa"
    assert any(p["text"] == "KDF482" for p in d["plates"]), [p["text"] for p in d["plates"]]
    assert {s["name"] for s in d["stages"]} >= {"yolo_deteccion", "crnn_lectura"}
