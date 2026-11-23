"""Galería de fotos reales con su valor esperado (backend/gallery/, la arma ml/build_gallery.py).

Conjuntos:
  * ``colombia``: fotos de carros colombianos; se conoce el texto de la placa pero no su caja.
  * ``dataset``: fotos de prueba del dataset de Hugging Face; se conoce la caja de cada placa
    y, cuando la etiqueta es legible, su texto (si no, ``text`` es ``None``).
Una carpeta de conjunto que falte en disco (p. ej. ``colombia``, que no está en git) se omite.
"""
from __future__ import annotations

import json
import os
import random
import threading
from pathlib import Path

GALLERY_DIR = Path(os.environ.get("PLACAS_GALLERY_DIR") or Path(__file__).resolve().parents[1] / "gallery")
SETS = ("colombia", "dataset")

_lock = threading.Lock()
_cache: dict | None = None


def _load() -> dict:
    global _cache
    with _lock:
        if _cache is None:
            path = GALLERY_DIR / "catalog.json"
            catalog = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {"sets": {}, "photos": []}
            photos = [p for p in catalog.get("photos", []) if (GALLERY_DIR / p["file"]).is_file()]
            _cache = {"sets": catalog.get("sets", {}), "photos": photos, "by_id": {p["id"]: p for p in photos}}
        return _cache


def public(photo: dict) -> dict:
    return {
        "id": photo["id"],
        "set": photo["set"],
        "image_url": f"/api/gallery/{photo['id']}/image",
        "width": photo["width"],
        "height": photo["height"],
        "ground_truth": photo["ground_truth"],
    }


def list_photos(photo_set: str | None = None) -> list[dict]:
    return [p for p in _load()["photos"] if photo_set in (None, "all", p["set"])]


def get_photo(photo_id: str) -> dict | None:
    return _load()["by_id"].get(photo_id)


def photo_path(photo: dict) -> Path:
    return GALLERY_DIR / photo["file"]


def sets_info() -> dict:
    data = _load()
    out = {}
    for name in SETS:
        photos = [p for p in data["photos"] if p["set"] == name]
        info = dict(data["sets"].get(name, {}))
        info.update(photos=len(photos), plates=sum(len(p["ground_truth"]) for p in photos))
        out[name] = info
    return out


def sample(count: int, seed: int | None, photo_set: str | None) -> list[dict]:
    pool = list_photos(photo_set)
    rng = random.Random(seed)
    return rng.sample(pool, min(count, len(pool)))
