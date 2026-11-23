"""Tests de la API con la galería de fotos reales (backend/gallery/) y el modelo entrenado.

Los que ejecutan el modelo se omiten si no están los pesos (backend/models/*.pt).
"""
import json
import sqlite3

import cv2
import numpy as np
import pytest

from backend.app import gallery, ml_inference
from backend.app.main import char_accuracy, evaluate, match_plates
from backend.app.storage import Storage

needs_models = pytest.mark.skipif(not ml_inference.available(), reason="modelos no entrenados")
needs_gallery = pytest.mark.skipif(not gallery.list_photos("dataset"), reason="galería sin armar (python ml/build_gallery.py)")


def _png_bytes(bgr):
    ok, buf = cv2.imencode(".png", bgr)
    assert ok
    return buf.tobytes()


def _plate(text, bbox):
    return {"text": text, "bbox": bbox}


# ------------------------------- Evaluación -------------------------------- #
def test_char_accuracy_uses_edit_distance():
    assert char_accuracy("ABC123", "ABC123") == 1.0
    assert char_accuracy("ABC123", "ABC-123") == 1.0  # se ignoran separadores
    assert char_accuracy("ABC123", "BC123") == pytest.approx(5 / 6)  # falta un carácter, no se descuadra todo
    assert char_accuracy("ABC123", "") == 0.0


def test_evaluate_with_boxes():
    gt = [{"text": "30V3993", "bbox": [100, 100, 80, 20]}, {"text": None, "bbox": [300, 100, 80, 20]}]
    plates = [_plate("30V3993", [102, 101, 80, 20]), _plate("XYZ", [305, 100, 78, 20])]
    ev = evaluate(plates, gt)
    assert ev == {"expected": 2, "matched": 2, "readable": 1, "exact_matches": 1,
                  "char_accuracy": 1.0, "correct": True}
    # una placa no localizada y un falso positivo
    ev = evaluate([_plate("30V3993", [102, 101, 80, 20]), _plate("AAA111", [0, 0, 10, 10])], gt)
    assert ev["matched"] == 1 and ev["correct"] is False


def test_evaluate_without_boxes_matches_by_text():
    gt = [{"text": "KOO042", "bbox": None}]
    plates = [_plate("MEDELL", [0, 0, 50, 20]), _plate("KOO042", [100, 100, 60, 30])]
    assert match_plates(plates, gt) == [(0, 1)]
    ev = evaluate(plates, gt)
    assert ev["exact_matches"] == 1 and ev["correct"] is False  # sobra una detección
    assert evaluate([], gt) == {"expected": 1, "matched": 0, "readable": 1, "exact_matches": 0,
                                "char_accuracy": 0.0, "correct": False}


# -------------------------------- Galería ---------------------------------- #
def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "version": "2.0.0", "model_available": ml_inference.available()}


@needs_gallery
def test_gallery_lists_real_photos(client):
    r = client.get("/api/gallery")
    assert r.status_code == 200
    body = r.json()
    assert set(body["sets"]) == {"colombia", "dataset"}
    assert body["sets"]["dataset"]["licencia"] == "CC BY 4.0"
    assert body["sets"]["dataset"]["photos"] == 150
    for p in body["photos"]:
        assert set(p) == {"id", "set", "image_url", "width", "height", "ground_truth"}
        assert p["ground_truth"]
        if p["set"] == "dataset":
            assert all(len(g["bbox"]) == 4 for g in p["ground_truth"])
        else:
            assert all(g["bbox"] is None and g["text"] for g in p["ground_truth"])
    only = client.get("/api/gallery", params={"set": "dataset"}).json()["photos"]
    assert only and all(p["set"] == "dataset" for p in only)
    img = client.get(only[0]["image_url"])
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    assert client.get("/api/gallery", params={"set": "simulado"}).status_code == 422
    assert client.get("/api/gallery/noexiste/image").status_code == 404


# ------------------------------- Detección --------------------------------- #
@needs_models
@needs_gallery
def test_detect_gallery_photo(client):
    photo = gallery.public(gallery.get_photo("ds_230"))  # Ford gris con placa 30V-3993
    r = client.post("/api/detect", json={"photo_id": "ds_230"})
    assert r.status_code == 200
    d = r.json()
    assert d["photo_id"] == "ds_230" and d["photo_set"] == "dataset" and d["source"] == "gallery"
    assert d["image_url"] == photo["image_url"] and d["ground_truth"] == photo["ground_truth"]
    ev = d["evaluation"]
    assert ev["expected"] == 1 and ev["matched"] == 1, "no localizó la placa"
    assert {s["name"] for s in d["stages"]} >= {"yolo_deteccion", "crnn_lectura"}
    for p in d["plates"]:
        assert set(p) == {"text", "confidence", "bbox", "chars", "crop_url", "valid_format",
                          "raw_text", "detection_confidence"}
        assert client.get(p["crop_url"]).status_code == 200
    assert client.get(d["annotated_url"]).status_code == 200
    item = client.get(f"/api/history/{d['id']}")
    assert item.status_code == 200 and item.json() == d


def test_detect_missing_photo(client):
    if not ml_inference.available():
        pytest.skip("modelos no entrenados")
    r = client.post("/api/detect", json={"photo_id": "noexiste"})
    assert r.status_code == 404 and isinstance(r.json()["detail"], str)


def test_detect_validation(client):
    assert client.post("/api/detect", json={}).status_code == 422
    assert client.post("/api/detect", json={"scene_id": "x"}).status_code == 422


def test_model_unavailable_gives_503(client, monkeypatch):
    monkeypatch.setattr(ml_inference, "available", lambda: False)
    r = client.post("/api/detect/upload", files={"file": ("a.png", _png_bytes(np.full((50, 50, 3), 128, np.uint8)), "image/png")})
    assert r.status_code == 503
    assert client.post("/api/detect/batch", json={"count": 1}).status_code == 503


@needs_models
def test_upload_without_plates(client):
    img = np.full((300, 400, 3), 128, np.uint8)
    r = client.post("/api/detect/upload", files={"file": ("gris.png", _png_bytes(img), "image/png")})
    assert r.status_code == 200
    d = r.json()
    assert d["source"] == "upload" and d["photo_id"] is None and d["photo_set"] is None
    assert d["plates"] == [] and d["ground_truth"] is None and d["evaluation"] is None


@needs_models
@pytest.mark.parametrize("shape", [(1, 1, 3), (10, 10, 3), (2, 8000, 3), (3000, 2500, 3)])
def test_upload_odd_sizes(client, shape):
    r = client.post("/api/detect/upload", files={"file": ("x.png", _png_bytes(np.full(shape, 90, np.uint8)), "image/png")})
    assert r.status_code == 200
    assert max(r.json()["width"], r.json()["height"]) <= 2000


def test_upload_not_an_image(client):
    if not ml_inference.available():
        pytest.skip("modelos no entrenados")
    r = client.post("/api/detect/upload", files={"file": ("nota.txt", b"hola mundo", "text/plain")})
    assert r.status_code == 400 and isinstance(r.json()["detail"], str)
    r = client.post("/api/detect/upload", files={"file": ("vacio.png", b"", "image/png")})
    assert r.status_code == 400


def test_upload_missing_file(client):
    assert client.post("/api/detect/upload").status_code == 422


@needs_models
@needs_gallery
def test_batch_and_stats(client):
    r = client.post("/api/detect/batch", json={"count": 6, "seed": 7, "set": "dataset"})
    assert r.status_code == 200
    body = r.json()
    assert len(body["results"]) == 6 and len({d["photo_id"] for d in body["results"]}) == 6
    assert all(d["photo_set"] == "dataset" for d in body["results"])
    m = body["metrics"]
    assert m["total_detections"] == 6 and set(m["by_set"]) == {"colombia", "dataset"}
    assert m["by_set"]["dataset"]["detections"] == 6 and m["by_set"]["colombia"]["detections"] == 0
    assert m["detection_rate"] >= 0.6  # el detector localiza ~96 % de las placas en prueba
    # misma semilla -> mismas fotos
    again = client.post("/api/detect/batch", json={"count": 6, "seed": 7, "set": "dataset"}).json()
    assert [d["photo_id"] for d in again["results"]] == [d["photo_id"] for d in body["results"]]

    stats = client.get("/api/stats").json()
    assert set(stats) == {"total_detections", "total_plates", "plate_accuracy", "char_accuracy",
                          "detection_rate", "avg_confidence", "avg_processing_ms", "by_set"}
    assert stats["total_detections"] >= 12
    hist = client.get("/api/history", params={"limit": 2}).json()["detections"]
    assert len(hist) == 2 and hist[0]["created_at"] >= hist[1]["created_at"]


@pytest.mark.parametrize("body", [{"count": 0}, {"count": 51}, {"count": 3, "set": "x"}])
def test_batch_validation(client, body):
    assert client.post("/api/detect/batch", json=body).status_code == 422


def test_report_endpoint(client):
    r = client.get("/api/report")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"gallery", "tests"}
    if body["gallery"]:
        assert body["gallery"]["summary"]["photos"] == len(gallery.list_photos())
        assert {"localization", "by_plate_size", "calibration", "char_confusions", "per_photo"} <= set(body["gallery"])


def test_history_missing_and_limits(client):
    assert client.get("/api/history/nada").status_code == 404
    assert client.get("/api/history", params={"limit": 0}).status_code == 422


def test_removed_legacy_routes(client):
    """Las rutas de la versión anterior ya no existen."""
    assert client.post("/api/simulate", json={"count": 1}).status_code == 404
    assert client.get("/api/scenes").status_code == 404


def test_images_not_found_and_traversal(client):
    assert client.get("/api/images/noexiste.png").status_code == 404
    assert client.get("/api/images/..%2F..%2Fplacas.db").status_code == 404
    assert client.get("/api/images/placas.db").status_code == 404


def test_frontend_served(client):
    r = client.get("/")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]


def test_migration_keeps_uploads(tmp_path):
    """Migración de una base antigua: se descartan los registros viejos y se conservan las fotos subidas."""
    (tmp_path / "images").mkdir()
    conn = sqlite3.connect(tmp_path / "placas.db")
    conn.executescript("""
        CREATE TABLE scenes (id TEXT PRIMARY KEY, filename TEXT, width INT, height INT, difficulty TEXT,
                             seed INT, ground_truth TEXT, created_at TEXT);
        CREATE TABLE detections (id TEXT PRIMARY KEY, scene_id TEXT, source TEXT NOT NULL, difficulty TEXT,
                                 data TEXT NOT NULL, created_at TEXT NOT NULL);
    """)
    old = {"id": "u1", "scene_id": None, "source": "upload", "engine": "ml", "difficulty": None,
           "image_url": "/api/images/upload_u1.png", "annotated_url": "/api/images/det_u1_annotated.png",
           "width": 10, "height": 10, "plates": [], "ground_truth": None, "evaluation": None,
           "processing_ms": 5.0, "stages": [], "created_at": "2026-01-01T00:00:00Z"}
    sim = dict(old, id="s1", source="simulated", scene_id="sc1", difficulty="easy")
    for d in (old, sim):
        conn.execute("INSERT INTO detections VALUES (?,?,?,?,?,?)",
                     (d["id"], d["scene_id"], d["source"], d["difficulty"], json.dumps(d), d["created_at"]))
    conn.commit()
    conn.close()
    for name in ("scene_sc1.png", "det_s1_annotated.png", "det_u1_annotated.png", "upload_u1.png"):
        (tmp_path / "images" / name).write_bytes(b"x")

    st = Storage(tmp_path)
    dets = st.list_detections(None)
    assert [d["id"] for d in dets] == ["u1"]
    assert dets[0]["photo_id"] is None and dets[0]["photo_set"] is None and "engine" not in dets[0]
    assert sorted(f.name for f in (tmp_path / "images").iterdir()) == ["det_u1_annotated.png", "upload_u1.png"]
    st.close()


def test_zz_delete_history(client, data_dir):
    before = client.get("/api/stats").json()["total_detections"]
    r = client.delete("/api/history")
    assert r.status_code == 200 and r.json() == {"deleted": before}
    assert client.get("/api/history").json()["detections"] == []
    assert client.get("/api/stats").json()["total_detections"] == 0
    assert not list((data_dir / "images").glob("*.png"))
