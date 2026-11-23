"""Configuración de pytest: directorio de datos temporal aislado (PLACAS_DATA_DIR)."""
import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Debe fijarse antes de importar la app para no tocar data/ del proyecto.
_TMP = tempfile.mkdtemp(prefix="placas_test_")
os.environ["PLACAS_DATA_DIR"] = _TMP


@pytest.fixture(scope="session")
def data_dir() -> Path:
    return Path(_TMP)


ADMIN = {"username": "admin", "name": "Administrador", "password": "clave-segura-2026"}


@pytest.fixture(scope="session")
def anon():
    """Cliente sin sesión iniciada (crea la cuenta de administrador si aún no existe)."""
    from fastapi.testclient import TestClient

    from backend.app.main import app

    with TestClient(app) as c:
        if c.get("/api/auth/status").json()["setup_required"]:
            assert c.post("/api/auth/setup", json=ADMIN).status_code == 200
            c.post("/api/auth/logout")
            c.cookies.clear()
        yield c


@pytest.fixture(scope="session")
def client(anon):
    """Cliente con la sesión del administrador iniciada."""
    from fastapi.testclient import TestClient

    from backend.app.main import app

    with TestClient(app) as c:
        r = c.post("/api/auth/login", json={"username": ADMIN["username"], "password": ADMIN["password"]})
        assert r.status_code == 200, r.text
        yield c
