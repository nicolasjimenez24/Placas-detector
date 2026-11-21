import cv2
import numpy as np
import pytest

from backend.app.generator import generate_scene


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "version": "1.0.0"}


def test_simulate_and_scene_schema(client):
    r = client.post("/api/simulate", json={"count": 2, "seed": 10, "difficulty": "easy"})
    assert r.status_code == 200
    scenes = r.json()["scenes"]
    assert len(scenes) == 2
    for s in scenes:
        assert set(s) == {"id", "image_url", "width", "height", "difficulty", "ground_truth", "created_at"}
        assert s["width"] == 960 and s["height"] == 600 and s["difficulty"] == "easy"
        assert s["ground_truth"] and all(set(g) == {"text", "bbox"} for g in s["ground_truth"])
        img = client.get(s["image_url"])
        assert img.status_code == 200 and img.headers["content-type"] == "image/png"
    # Misma semilla -> mismo ground truth.
    again = client.post("/api/simulate", json={"count": 1, "seed": 10, "difficulty": "easy"}).json()
    assert again["scenes"][0]["ground_truth"] == scenes[0]["ground_truth"]


def test_simulate_defaults(client):
    r = client.post("/api/simulate", json={})
    assert r.status_code == 200 and len(r.json()["scenes"]) == 1


@pytest.mark.parametrize("body", [
    {"count": 0}, {"count": 13}, {"count": 2, "difficulty": "extreme"}, {"count": "x"},
])
def test_simulate_validation(client, body):
    r = client.post("/api/simulate", json=body)
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], str)


def test_detect_scene(client):
    scene = client.post("/api/simulate", json={"count": 1, "seed": 77, "difficulty": "easy"}).json()["scenes"][0]
    r = client.post("/api/detect", json={"scene_id": scene["id"]})
    assert r.status_code == 200
    d = r.json()
    assert d["scene_id"] == scene["id"] and d["source"] == "simulated" and d["difficulty"] == "easy"
    assert d["engine"] == "clasico"
    assert d["ground_truth"] == scene["ground_truth"]
    ev = d["evaluation"]
    assert set(ev) == {"matched", "expected", "exact_matches", "char_accuracy", "correct"}
    assert ev["expected"] == len(scene["ground_truth"])
    assert ev["correct"] is True and ev["char_accuracy"] == 1.0
    assert d["processing_ms"] > 0 and len(d["stages"]) == 8
    for p in d["plates"]:
        assert set(p) == {"text", "confidence", "bbox", "chars", "crop_url", "valid_format",
                          "raw_text", "detection_confidence"}
        assert p["raw_text"] is None and p["detection_confidence"] is None  # solo los llena el motor "ml"
        assert client.get(p["crop_url"]).status_code == 200
    assert client.get(d["annotated_url"]).status_code == 200
    assert client.get(d["image_url"]).status_code == 200
    item = client.get(f"/api/history/{d['id']}")
    assert item.status_code == 200 and item.json() == d


def test_detect_missing_scene(client):
    r = client.post("/api/detect", json={"scene_id": "noexiste"})
    assert r.status_code == 404 and isinstance(r.json()["detail"], str)


def test_detect_validation(client):
    assert client.post("/api/detect", json={}).status_code == 422


def _png_bytes(bgr):
    ok, buf = cv2.imencode(".png", bgr)
    assert ok
    return buf.tobytes()


def test_upload_with_plates(client):
    s = generate_scene(31, "medium")
    bgr = cv2.cvtColor(np.asarray(s.image), cv2.COLOR_RGB2BGR)
    ok, jpg = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])
    r = client.post("/api/detect/upload", files={"file": ("escena.jpg", jpg.tobytes(), "image/jpeg")},
                    data={"engine": "clasico"})
    assert r.status_code == 200
    d = r.json()
    assert d["source"] == "upload" and d["scene_id"] is None and d["engine"] == "clasico"
    assert d["ground_truth"] is None and d["evaluation"] is None and d["difficulty"] is None
    assert {p["text"] for p in d["plates"]} == {p.text for p in s.plates}


def test_upload_without_plates(client):
    img = np.full((300, 400, 3), 128, np.uint8)
    r = client.post("/api/detect/upload", files={"file": ("gris.png", _png_bytes(img), "image/png")})
    assert r.status_code == 200 and r.json()["plates"] == []


def test_upload_not_an_image(client):
    r = client.post("/api/detect/upload", files={"file": ("nota.txt", b"hola mundo", "text/plain")})
    assert r.status_code == 400 and isinstance(r.json()["detail"], str)
    r = client.post("/api/detect/upload", files={"file": ("vacio.png", b"", "image/png")})
    assert r.status_code == 400


def test_upload_missing_file(client):
    assert client.post("/api/detect/upload").status_code == 422


def test_batch(client):
    r = client.post("/api/detect/batch", json={"count": 4, "seed": 500, "difficulty": "medium"})
    assert r.status_code == 200
    body = r.json()
    assert len(body["results"]) == 4
    m = body["metrics"]
    assert m["total_detections"] == 4
    assert set(m["by_difficulty"]) == {"easy", "medium", "hard"}
    assert m["by_difficulty"]["medium"]["detections"] == 4
    assert m["by_difficulty"]["easy"]["detections"] == 0
    assert m["plate_accuracy"] >= 0.75


@pytest.mark.parametrize("body", [{"count": 0}, {"count": 51}, {"count": 3, "difficulty": "x"}])
def test_batch_validation(client, body):
    assert client.post("/api/detect/batch", json=body).status_code == 422


def test_lists_and_stats(client):
    client.post("/api/detect/batch", json={"count": 2, "seed": 1, "difficulty": "hard"})
    scenes = client.get("/api/scenes", params={"limit": 3}).json()["scenes"]
    assert len(scenes) == 3
    hist = client.get("/api/history", params={"limit": 2}).json()["detections"]
    assert len(hist) == 2
    assert hist[0]["created_at"] >= hist[1]["created_at"]
    stats = client.get("/api/stats").json()
    assert set(stats) == {"total_detections", "total_plates", "plate_accuracy", "char_accuracy",
                          "detection_rate", "avg_confidence", "avg_processing_ms", "by_difficulty"}
    assert stats["total_detections"] >= 2
    assert set(stats["by_difficulty"]["hard"]) == {"detections", "plate_accuracy", "char_accuracy",
                                                   "detection_rate", "avg_processing_ms"}
    assert client.get("/api/history", params={"limit": 0}).status_code == 422


def test_history_missing(client):
    assert client.get("/api/history/nada").status_code == 404


def test_images_not_found_and_traversal(client):
    assert client.get("/api/images/noexiste.png").status_code == 404
    assert client.get("/api/images/..%2F..%2Fplacas.db").status_code == 404
    assert client.get("/api/images/placas.db").status_code == 404


def test_frontend_served(client):
    r = client.get("/")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]


def test_unknown_api_route(client):
    assert client.get("/api/noexiste").status_code == 404


def test_zz_delete_history(client, data_dir):
    client.post("/api/simulate", json={"count": 1, "seed": 3})
    before = client.get("/api/stats").json()["total_detections"]
    r = client.delete("/api/history")
    assert r.status_code == 200 and r.json() == {"deleted": before}
    assert client.get("/api/history").json()["detections"] == []
    assert client.get("/api/scenes").json()["scenes"] == []
    assert client.get("/api/stats").json()["total_detections"] == 0
    assert not list((data_dir / "images").glob("*.png"))
