"""Persistencia: SQLite (escenas y detecciones) + carpeta de imágenes.

Directorio de datos: variable de entorno ``PLACAS_DATA_DIR`` o ``<raíz>/data``.
Thread-safe: una única conexión protegida por un ``RLock``.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from pathlib import Path

import cv2
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def data_dir() -> Path:
    env = os.environ.get("PLACAS_DATA_DIR")
    return Path(env).resolve() if env else PROJECT_ROOT / "data"


class Storage:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.images_dir = self.root / "images"
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.root / "placas.db"
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS scenes (
                    id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    width INTEGER NOT NULL,
                    height INTEGER NOT NULL,
                    difficulty TEXT NOT NULL,
                    seed INTEGER,
                    ground_truth TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS detections (
                    id TEXT PRIMARY KEY,
                    scene_id TEXT,
                    source TEXT NOT NULL,
                    difficulty TEXT,
                    data TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_scenes_created ON scenes(created_at);
                CREATE INDEX IF NOT EXISTS idx_det_created ON detections(created_at);
                """
            )
            self._conn.commit()

    # ------------------------------ Imágenes ------------------------------ #
    def save_image(self, filename: str, bgr: np.ndarray) -> Path:
        path = self.images_dir / filename
        ok, buf = cv2.imencode(".png", bgr, [cv2.IMWRITE_PNG_COMPRESSION, 1])
        if not ok:  # pragma: no cover
            raise IOError(f"no se pudo codificar {filename}")
        path.write_bytes(buf.tobytes())
        return path

    def image_path(self, filename: str) -> Path | None:
        path = (self.images_dir / filename).resolve()
        if path.parent != self.images_dir.resolve() or not path.is_file():
            return None
        return path

    def load_image(self, filename: str) -> np.ndarray | None:
        path = self.image_path(filename)
        if path is None:
            return None
        return cv2.imdecode(np.fromfile(str(path), np.uint8), cv2.IMREAD_COLOR)

    # ------------------------------- Escenas ------------------------------ #
    def add_scene(self, scene: dict, filename: str, seed: int | None) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO scenes VALUES (?,?,?,?,?,?,?,?)",
                (scene["id"], filename, scene["width"], scene["height"], scene["difficulty"],
                 seed, json.dumps(scene["ground_truth"]), scene["created_at"]),
            )
            self._conn.commit()

    @staticmethod
    def _scene_row(row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "image_url": f"/api/images/{row['filename']}",
            "width": row["width"],
            "height": row["height"],
            "difficulty": row["difficulty"],
            "ground_truth": json.loads(row["ground_truth"]),
            "created_at": row["created_at"],
            "_filename": row["filename"],
        }

    def get_scene(self, scene_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM scenes WHERE id=?", (scene_id,)).fetchone()
        return self._scene_row(row) if row else None

    def list_scenes(self, limit: int = 50) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM scenes ORDER BY created_at DESC, rowid DESC LIMIT ?", (limit,)
            ).fetchall()
        return [self._scene_row(r) for r in rows]

    # ----------------------------- Detecciones ---------------------------- #
    def add_detection(self, det: dict) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO detections VALUES (?,?,?,?,?,?)",
                (det["id"], det.get("scene_id"), det["source"], det.get("difficulty"),
                 json.dumps(det), det["created_at"]),
            )
            self._conn.commit()

    def get_detection(self, det_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT data FROM detections WHERE id=?", (det_id,)).fetchone()
        return json.loads(row["data"]) if row else None

    def list_detections(self, limit: int | None = 50) -> list[dict]:
        sql = "SELECT data FROM detections ORDER BY created_at DESC, rowid DESC"
        with self._lock:
            if limit is None:
                rows = self._conn.execute(sql).fetchall()
            else:
                rows = self._conn.execute(sql + " LIMIT ?", (limit,)).fetchall()
        return [json.loads(r["data"]) for r in rows]

    def clear(self) -> int:
        """Borra historial, escenas e imágenes. Devuelve el nº de detecciones borradas."""
        with self._lock:
            n = self._conn.execute("SELECT COUNT(*) FROM detections").fetchone()[0]
            self._conn.execute("DELETE FROM detections")
            self._conn.execute("DELETE FROM scenes")
            self._conn.commit()
            for f in self.images_dir.glob("*.png"):
                try:
                    f.unlink()
                except OSError:  # pragma: no cover - archivo en uso (Windows)
                    pass
        return int(n)

    def close(self) -> None:
        with self._lock:
            self._conn.close()


_storages: dict[str, Storage] = {}
_storages_lock = threading.Lock()


def get_storage() -> Storage:
    """Instancia por directorio de datos (permite aislar los tests vía PLACAS_DATA_DIR)."""
    root = data_dir()
    key = str(root)
    with _storages_lock:
        if key not in _storages:
            _storages[key] = Storage(root)
        return _storages[key]
