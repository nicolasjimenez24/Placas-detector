"""Resolución centralizada de la fuente usada por el generador y el OCR.

Generador y detector DEBEN usar la misma fuente para que las plantillas de
glifos coincidan con los caracteres dibujados en las placas.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from PIL import ImageFont

FONT_CANDIDATES = [
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/consolab.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


@lru_cache(maxsize=1)
def font_path() -> str | None:
    """Devuelve la ruta de la primera fuente disponible (o None)."""
    env = os.environ.get("PLACAS_FONT")
    if env and Path(env).is_file():
        return env
    for cand in FONT_CANDIDATES:
        if Path(cand).is_file():
            return cand
    return None


@lru_cache(maxsize=64)
def get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Fuente TrueType al tamaño pedido (fallback: fuente por defecto de Pillow)."""
    path = font_path()
    if path:
        return ImageFont.truetype(path, size)
    try:  # Pillow >= 10.1 permite tamaño en la fuente por defecto
        return ImageFont.load_default(size=size)
    except TypeError:  # pragma: no cover
        return ImageFont.load_default()
