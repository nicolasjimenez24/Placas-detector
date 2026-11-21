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


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from backend.app.main import app

    with TestClient(app) as c:
        yield c
