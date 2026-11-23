"""Autenticación: usuarios con contraseña cifrada, sesiones por cookie y protección de la API.

* Contraseñas: PBKDF2-HMAC-SHA256 con sal aleatoria y 240 000 iteraciones (solo biblioteca estándar).
  Se guarda ``pbkdf2_sha256$iteraciones$sal$hash``; nunca la contraseña.
* Sesiones: token aleatorio en una cookie HttpOnly (SameSite=Lax). En la base de datos solo se
  guarda el SHA-256 del token, así que una copia de la base no permite suplantar sesiones.
* Primer uso: si no hay usuarios, ``POST /api/auth/setup`` crea la cuenta de administrador.
* Fuerza bruta: tras ``MAX_FAILS`` intentos fallidos seguidos, el usuario queda bloqueado
  ``LOCK_SECONDS`` segundos.

Crear más usuarios desde la terminal (raíz del proyecto)::

    python -m backend.app.auth crear-usuario profesor --nombre "Profesor"
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .storage import get_storage

COOKIE = "pv_session"
SESSION_HOURS = 8
ITERATIONS = 240_000
MIN_PASSWORD = 8
MAX_FAILS = 5
LOCK_SECONDS = 60
USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,32}$")
# Rutas de la API accesibles sin sesión
PUBLIC_API = {"/api/health", "/api/auth/status", "/api/auth/login", "/api/auth/setup", "/api/auth/logout"}

router = APIRouter(prefix="/api/auth", tags=["auth"])


# --------------------------------------------------------------------------- #
# Contraseñas y tokens
# --------------------------------------------------------------------------- #
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), ITERATIONS).hex()
    return f"pbkdf2_sha256${ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt, digest = stored.split("$")
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    calc = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iters)).hex()
    return hmac.compare_digest(calc, digest)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def validate_password(password: str, username: str = "") -> None:
    problems = []
    if len(password) < MIN_PASSWORD:
        problems.append(f"al menos {MIN_PASSWORD} caracteres")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        problems.append("letras y números")
    if username and username.lower() in password.lower():
        problems.append("no contener el nombre de usuario")
    if problems:
        raise HTTPException(status_code=422, detail="La contraseña debe tener " + ", ".join(problems) + ".")


def public_user(u: dict) -> dict:
    return {"id": u["id"], "username": u["username"], "name": u["name"], "role": u["role"],
            "last_login": u.get("last_login")}


def create_user(username: str, name: str, password: str, role: str = "usuario") -> dict:
    username = username.strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(status_code=422, detail="El usuario debe tener de 3 a 32 caracteres: letras, números, punto, guion o guion bajo.")
    validate_password(password, username)
    st = get_storage()
    if st.get_user_by_username(username):
        raise HTTPException(status_code=409, detail=f"El usuario '{username}' ya existe.")
    return st.create_user(username, name.strip() or username, hash_password(password), role, _iso(_now()))


# --------------------------------------------------------------------------- #
# Bloqueo por intentos fallidos (en memoria)
# --------------------------------------------------------------------------- #
_fails: dict[str, tuple[int, float]] = {}  # usuario -> (fallos seguidos, bloqueado hasta)
_fails_lock = threading.Lock()


def _check_lock(username: str) -> None:
    with _fails_lock:
        n, until = _fails.get(username.lower(), (0, 0.0))
    if until > time.time():
        raise HTTPException(status_code=429, detail=f"Demasiados intentos fallidos. Espera {int(until - time.time()) + 1} s e inténtalo de nuevo.")


def _register_fail(username: str) -> None:
    key = username.lower()
    with _fails_lock:
        n, _ = _fails.get(key, (0, 0.0))
        n += 1
        _fails[key] = (0, time.time() + LOCK_SECONDS) if n >= MAX_FAILS else (n, 0.0)


def _clear_fails(username: str) -> None:
    with _fails_lock:
        _fails.pop(username.lower(), None)


def reset_lockouts() -> None:
    with _fails_lock:
        _fails.clear()


# --------------------------------------------------------------------------- #
# Sesiones
# --------------------------------------------------------------------------- #
def _start_session(response: Response, request: Request, user: dict) -> None:
    token = secrets.token_urlsafe(32)
    now = _now()
    get_storage().create_session(_token_hash(token), user["id"], _iso(now), _iso(now + timedelta(hours=SESSION_HOURS)))
    get_storage().touch_login(user["id"], _iso(now))
    response.set_cookie(COOKIE, token, max_age=SESSION_HOURS * 3600, httponly=True, samesite="lax",
                        secure=request.url.scheme == "https", path="/")


def current_user(request: Request) -> dict | None:
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    st = get_storage()
    sess = st.get_session(_token_hash(token))
    if not sess or sess["expires_at"] < _iso(_now()):
        return None
    return st.get_user(sess["user_id"])


def is_public(path: str) -> bool:
    return not path.startswith("/api/") or path in PUBLIC_API


# --------------------------------------------------------------------------- #
# Rutas
# --------------------------------------------------------------------------- #
class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)


class SetupRequest(BaseModel):
    username: str = Field(..., max_length=64)
    name: str = Field("", max_length=80)
    password: str = Field(..., max_length=256)


@router.get("/status")
def status(request: Request):
    user = current_user(request)
    return {"setup_required": get_storage().count_users() == 0,
            "user": public_user(user) if user else None}


@router.post("/setup")
def setup(req: SetupRequest, request: Request, response: Response):
    if get_storage().count_users() > 0:
        raise HTTPException(status_code=409, detail="La cuenta de administrador ya fue creada. Inicia sesión.")
    user = create_user(req.username, req.name, req.password, role="administrador")
    _start_session(response, request, user)
    return {"user": public_user(user)}


@router.post("/login")
def login(req: LoginRequest, request: Request, response: Response):
    username = req.username.strip()
    _check_lock(username)
    user = get_storage().get_user_by_username(username)
    # se verifica siempre una contraseña (aunque el usuario no exista) para no revelar por el tiempo de respuesta qué usuarios existen
    ok = verify_password(req.password, user["password_hash"] if user else hash_password("x" * 12))
    if not user or not ok:
        _register_fail(username)
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
    _clear_fails(username)
    _start_session(response, request, user)
    return {"user": public_user(get_storage().get_user(user["id"]))}


@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE)
    if token:
        get_storage().delete_session(_token_hash(token))
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(request: Request):
    return {"user": public_user(request.state.user)}


# --------------------------------------------------------------------------- #
# Terminal: crear usuarios o cambiar contraseñas
# --------------------------------------------------------------------------- #
def _cli() -> None:
    import argparse
    import getpass

    ap = argparse.ArgumentParser(prog="python -m backend.app.auth", description="Gestión de usuarios de PlacaVision")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("crear-usuario", help="crea un usuario (pide la contraseña)")
    c.add_argument("usuario")
    c.add_argument("--nombre", default="")
    c.add_argument("--admin", action="store_true")
    pw = sub.add_parser("cambiar-clave", help="cambia la contraseña de un usuario")
    pw.add_argument("usuario")
    sub.add_parser("listar", help="lista los usuarios")
    args = ap.parse_args()
    st = get_storage()
    try:
        if args.cmd == "listar":
            for u in st.list_users():
                print(f"{u['id']:3d}  {u['username']:20s} {u['role']:14s} {u['name']}  (último acceso: {u['last_login'] or '—'})")
            return
        p1 = getpass.getpass("Contraseña: ")
        if getpass.getpass("Repite la contraseña: ") != p1:
            raise SystemExit("Las contraseñas no coinciden.")
        if args.cmd == "crear-usuario":
            u = create_user(args.usuario, args.nombre, p1, "administrador" if args.admin else "usuario")
            print(f"Usuario '{u['username']}' creado.")
        else:
            u = st.get_user_by_username(args.usuario)
            if not u:
                raise SystemExit(f"No existe el usuario '{args.usuario}'.")
            validate_password(p1, u["username"])
            st.set_password(u["id"], hash_password(p1))
            print("Contraseña cambiada; se cerraron sus sesiones abiertas.")
    except HTTPException as e:
        raise SystemExit(e.detail)


if __name__ == "__main__":
    _cli()
