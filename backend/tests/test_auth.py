"""Tests del inicio de sesión: cuenta inicial, contraseñas, sesiones, bloqueo y protección de la API."""
import pytest
from fastapi.testclient import TestClient

from backend.app import auth
from backend.app.main import app
from backend.app.storage import get_storage

from .conftest import ADMIN


@pytest.fixture()
def fresh():
    """Cliente nuevo, sin cookies, con los bloqueos reiniciados."""
    auth.reset_lockouts()
    with TestClient(app) as c:
        yield c
    auth.reset_lockouts()


def test_password_hash_is_salted_and_verifiable():
    h1, h2 = auth.hash_password("abc12345"), auth.hash_password("abc12345")
    assert h1 != h2 and "abc12345" not in h1  # sal distinta, nunca en claro
    assert h1.startswith(f"pbkdf2_sha256${auth.ITERATIONS}$")
    assert auth.verify_password("abc12345", h1)
    assert not auth.verify_password("abc12346", h1)
    assert not auth.verify_password("abc12345", "basura")


def test_api_requires_session(fresh):
    for path in ("/api/gallery", "/api/history", "/api/stats", "/api/model", "/api/report", "/api/auth/me"):
        r = fresh.get(path)
        assert r.status_code == 401, path
        assert "Inicia sesión" in r.json()["detail"]
    assert fresh.post("/api/detect", json={"photo_id": "co_1"}).status_code == 401
    assert fresh.get("/api/gallery/co_1/image").status_code == 401
    # públicas
    assert fresh.get("/api/health").status_code == 200
    assert fresh.get("/").status_code == 200
    assert fresh.get("/login.html").status_code == 200


def test_status_and_setup_only_once(fresh):
    st = fresh.get("/api/auth/status").json()
    assert st == {"setup_required": False, "user": None}
    r = fresh.post("/api/auth/setup", json={"username": "otro", "name": "X", "password": "clave12345"})
    assert r.status_code == 409


def test_login_wrong_and_right(fresh):
    r = fresh.post("/api/auth/login", json={"username": ADMIN["username"], "password": "incorrecta1"})
    assert r.status_code == 401 and r.json()["detail"] == "Usuario o contraseña incorrectos."
    r = fresh.post("/api/auth/login", json={"username": "noexiste", "password": "loquesea1"})
    assert r.status_code == 401 and r.json()["detail"] == "Usuario o contraseña incorrectos."  # mismo mensaje
    r = fresh.post("/api/auth/login", json={"username": ADMIN["username"].upper(), "password": ADMIN["password"]})
    assert r.status_code == 200
    assert r.json()["user"]["username"] == "admin" and r.json()["user"]["role"] == "administrador"
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    me = fresh.get("/api/auth/me")
    assert me.status_code == 200 and me.json()["user"]["name"] == ADMIN["name"]
    assert "password_hash" not in me.json()["user"]
    assert fresh.get("/api/gallery").status_code == 200


def test_session_token_is_stored_hashed(fresh):
    fresh.post("/api/auth/login", json={"username": ADMIN["username"], "password": ADMIN["password"]})
    token = fresh.cookies.get(auth.COOKIE)
    assert token and get_storage().get_session(token) is None  # en la base solo está el hash
    assert get_storage().get_session(auth._token_hash(token)) is not None


def test_logout_invalidates_session(fresh):
    fresh.post("/api/auth/login", json={"username": ADMIN["username"], "password": ADMIN["password"]})
    token = fresh.cookies.get(auth.COOKIE)
    assert fresh.post("/api/auth/logout").status_code == 200
    fresh.cookies.set(auth.COOKIE, token)  # reutilizar la cookie vieja no sirve
    assert fresh.get("/api/history").status_code == 401


def test_forged_cookie_rejected(fresh):
    fresh.cookies.set(auth.COOKIE, "token-inventado")
    assert fresh.get("/api/stats").status_code == 401


def test_lockout_after_failed_attempts(fresh):
    for _ in range(auth.MAX_FAILS):
        assert fresh.post("/api/auth/login", json={"username": "admin", "password": "mala12345"}).status_code == 401
    r = fresh.post("/api/auth/login", json={"username": "admin", "password": ADMIN["password"]})
    assert r.status_code == 429 and "Espera" in r.json()["detail"]  # bloqueado aunque ahora sea correcta
    auth.reset_lockouts()
    assert fresh.post("/api/auth/login", json={"username": "admin", "password": ADMIN["password"]}).status_code == 200


@pytest.mark.parametrize("username, password, fragment", [
    ("ab", "clave12345", "3 a 32"),
    ("con espacio", "clave12345", "3 a 32"),
    ("nuevo1", "corta1", "al menos"),
    ("nuevo2", "sololetras", "letras y números"),
    ("pedro", "pedro12345", "nombre de usuario"),
])
def test_user_validation(username, password, fragment):
    with pytest.raises(Exception) as e:
        auth.create_user(username, "", password)
    assert fragment in e.value.detail


def test_create_second_user_and_duplicate():
    u = auth.create_user("profesor", "Profesor", "revision2026")
    assert u["role"] == "usuario"
    with pytest.raises(Exception) as e:
        auth.create_user("PROFESOR", "", "revision2026")
    assert e.value.status_code == 409
