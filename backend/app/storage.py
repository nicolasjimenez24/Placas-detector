"""Persistencia: SQLite (historial de detecciones) + carpeta de imágenes.

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
            self._conn.execute("PRAGMA foreign_keys=ON")
            self._migrate_from_simulated()
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS detections (
                    id TEXT PRIMARY KEY,
                    photo_id TEXT,
                    source TEXT NOT NULL,
                    photo_set TEXT,
                    data TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_det_created ON detections(created_at);
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'usuario',
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    last_login TEXT
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                """
            )
            self._conn.commit()

    def _migrate_from_simulated(self) -> None:
        """Bases de la versión con escenas simuladas: borra lo simulado y conserva las subidas."""
        tables = {r[0] for r in self._conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "scenes" not in tables:
            return
        rows = self._conn.execute("SELECT id, source, data, created_at FROM detections").fetchall()
        keep = []
        for r in rows:
            if r["source"] == "upload":
                d = json.loads(r["data"])
                for k in ("scene_id", "difficulty", "engine"):
                    d.pop(k, None)
                d.update(photo_id=None, photo_set=None, ground_truth=None, evaluation=None)
                keep.append((d["id"], None, "upload", None, json.dumps(d), r["created_at"]))
            else:
                for f in self.images_dir.glob(f"det_{r['id']}_*.png"):
                    f.unlink(missing_ok=True)
        for f in self.images_dir.glob("scene_*.png"):
            f.unlink(missing_ok=True)
        self._conn.execute("DROP TABLE scenes")
        self._conn.execute("DROP TABLE detections")
        self._conn.execute(
            "CREATE TABLE detections (id TEXT PRIMARY KEY, photo_id TEXT, source TEXT NOT NULL,"
            " photo_set TEXT, data TEXT NOT NULL, created_at TEXT NOT NULL)")
        self._conn.executemany("INSERT INTO detections VALUES (?,?,?,?,?,?)", keep)
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

    # ----------------------------- Detecciones ---------------------------- #
    def add_detection(self, det: dict) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO detections VALUES (?,?,?,?,?,?)",
                (det["id"], det.get("photo_id"), det["source"], det.get("photo_set"),
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
        """Borra el historial y sus imágenes. Devuelve el nº de detecciones borradas."""
        with self._lock:
            n = self._conn.execute("SELECT COUNT(*) FROM detections").fetchone()[0]
            self._conn.execute("DELETE FROM detections")
            self._conn.commit()
            for f in self.images_dir.glob("*.png"):
                try:
                    f.unlink()
                except OSError:  # pragma: no cover - archivo en uso (Windows)
                    pass
        return int(n)

    # ------------------------------ Usuarios ------------------------------ #
    def count_users(self) -> int:
        with self._lock:
            return int(self._conn.execute("SELECT COUNT(*) FROM users").fetchone()[0])

    def create_user(self, username: str, name: str, password_hash: str, role: str, created_at: str) -> dict:
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO users (username, name, role, password_hash, created_at) VALUES (?,?,?,?,?)",
                (username, name, role, password_hash, created_at))
            self._conn.commit()
            return self.get_user(cur.lastrowid)

    def get_user(self, user_id: int) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        return dict(row) if row else None

    def get_user_by_username(self, username: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        return dict(row) if row else None

    def list_users(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute("SELECT id, username, name, role, created_at, last_login FROM users ORDER BY id").fetchall()
        return [dict(r) for r in rows]

    def set_password(self, user_id: int, password_hash: str) -> None:
        with self._lock:
            self._conn.execute("UPDATE users SET password_hash=? WHERE id=?", (password_hash, user_id))
            self._conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
            self._conn.commit()

    def touch_login(self, user_id: int, when: str) -> None:
        with self._lock:
            self._conn.execute("UPDATE users SET last_login=? WHERE id=?", (when, user_id))
            self._conn.commit()

    # ------------------------------ Sesiones ------------------------------ #
    def create_session(self, token_hash: str, user_id: int, created_at: str, expires_at: str) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM sessions WHERE expires_at < ?", (created_at,))
            self._conn.execute("INSERT INTO sessions VALUES (?,?,?,?)", (token_hash, user_id, created_at, expires_at))
            self._conn.commit()

    def get_session(self, token_hash: str) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM sessions WHERE token_hash=?", (token_hash,)).fetchone()
        return dict(row) if row else None

    def delete_session(self, token_hash: str) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
            self._conn.commit()

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
