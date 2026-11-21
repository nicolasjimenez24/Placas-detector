"""Generador de recortes sintéticos de placas colombianas para entrenar el lector (OCR).

Las placas de carro particulares en Colombia son amarillas, con tres letras y tres números
(ABC 123), un separador central y el municipio debajo. Ningún dataset abierto trae placas
colombianas con texto etiquetado, así que se sintetizan con mucha variación para que el
modelo aprenda el formato y luego se combina con recortes de fotos reales de otros países.
"""
from __future__ import annotations

import io
import random
import string
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_DIRS = [Path("C:/Windows/Fonts"), Path("/usr/share/fonts/truetype/dejavu")]
FONT_NAMES = ["bahnschrift.ttf", "ARIALNB.TTF", "arialbd.ttf", "impact.ttf", "framd.ttf",
              "tahomabd.ttf", "trebucbd.ttf", "verdanab.ttf", "segoeuib.ttf", "calibrib.ttf",
              "DejaVuSans-Bold.ttf", "DejaVuSansCondensed-Bold.ttf"]
CITIES = ["BOGOTA D.C.", "MEDELLIN", "CALI", "BARRANQUILLA", "CARTAGENA", "BUCARAMANGA", "PEREIRA",
          "MANIZALES", "ARMENIA", "ENVIGADO", "RIONEGRO", "SABANETA", "ITAGUI", "CHIA", "FUNZA",
          "COTA", "TUNJA", "IBAGUE", "NEIVA", "PASTO", "IPIALES", "POPAYAN", "VILLAVICENCIO",
          "SANTA MARTA", "MONTERIA", "VALLEDUPAR", "SINCELEJO", "CUCUTA", "PALMIRA", "TULUA",
          "BELLO", "SOACHA", "MOSQUERA", "MADRID", "GIRARDOT", "DOSQUEBRADAS", "COLOMBIA", ""]
LETTERS = string.ascii_uppercase
DIGITS = string.digits


@lru_cache(maxsize=None)
def available_fonts() -> tuple[Path, ...]:
    found = [d / n for d in FONT_DIRS for n in FONT_NAMES if (d / n).is_file()]
    if not found:
        raise FileNotFoundError("No se encontró ninguna fuente para generar placas")
    return tuple(found)


BAHN_VARIANTS = ["Bold Condensed", "SemiBold Condensed", "Bold SemiCondensed", "SemiBold SemiCondensed",
                 "Condensed", "Bold", "SemiBold"]


@lru_cache(maxsize=512)
def _font(path: str, size: int, variation: str | None = None) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(path, size)
    if variation:
        f.set_variation_by_name(variation)
    return f


def _pick_font(rng: random.Random) -> tuple[str, str | None]:
    """Mitad de las veces Bahnschrift condensada (la más parecida a la tipografía de las placas)."""
    fonts = available_fonts()
    bahn = [f for f in fonts if f.name.lower() == "bahnschrift.ttf"]
    if bahn and rng.random() < 0.5:
        return str(bahn[0]), rng.choice(BAHN_VARIANTS)
    return str(rng.choice(fonts)), None


def _text_layer(text: str, font_path: str, variation: str | None, ink, size: int = 160) -> Image.Image:
    """Texto renderizado grande sobre transparente y recortado a su caja exacta."""
    f = _font(font_path, size, variation)
    tmp = Image.new("L", (1, 1))
    l, t, r, b = ImageDraw.Draw(tmp).textbbox((0, 0), text, font=f)
    layer = Image.new("RGBA", (r - l + 4, b - t + 4), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((2 - l, 2 - t), text, font=f, fill=(*ink, 255))
    return layer


def random_plate_text(rng: random.Random) -> str:
    return "".join(rng.choices(LETTERS, k=3)) + "".join(rng.choices(DIGITS, k=3))


def _fit_text(draw, text, font_path, max_w, max_h, start):
    size = start
    while size > 8:
        f = _font(font_path, size)
        l, t, r, b = draw.textbbox((0, 0), text, font=f)
        if r - l <= max_w and b - t <= max_h:
            return f, (l, t, r, b)
        size -= 2
    f = _font(font_path, 8)
    return f, draw.textbbox((0, 0), text, font=f)


def render_plate(text: str, rng: random.Random) -> Image.Image:
    """Dibuja una placa colombiana frontal (sin deformar) de ~3:1."""
    W, H = 330, 160
    yellow = (rng.randint(225, 255), rng.randint(170, 215), rng.randint(0, 60))
    ink = tuple([rng.randint(0, 45)] * 3)
    im = Image.new("RGB", (W, H), yellow)
    d = ImageDraw.Draw(im)
    bw = rng.randint(3, 8)
    d.rounded_rectangle([bw // 2, bw // 2, W - bw // 2 - 1, H - bw // 2 - 1], radius=rng.randint(4, 14),
                        outline=ink, width=bw)
    font_path, variation = _pick_font(rng)
    sep = rng.choice(["·", "-", " ", "•", "·", "o"])
    main = f"{text[:3]}{sep}{text[3:]}" if sep != "o" else f"{text[:3]}  {text[3:]}"
    layer = _text_layer(main, font_path, variation, ink)
    # caracteres altos y estrechos como los de las placas reales
    th = int(H * rng.uniform(0.52, 0.66))
    tw = int(layer.width * th / layer.height * rng.uniform(0.72, 1.0))
    tw = min(tw, W - 2 * bw - 14)
    layer = layer.resize((max(10, tw), max(10, th)), Image.Resampling.LANCZOS)
    tx = int((W - layer.width) / 2 + rng.uniform(-5, 5))
    ty = int(H * rng.uniform(0.07, 0.13))
    if rng.random() < 0.6:  # relieve: sombra/brillo desplazados
        shade = Image.new("RGBA", layer.size, (*[min(255, c + 60) for c in yellow], 0))
        shade.putalpha(layer.getchannel("A").point(lambda a: int(a * 0.55)))
        im.paste(shade, (tx + rng.choice([-2, 2]), ty + 2), shade)
    im.paste(layer, (tx, ty), layer)
    if sep == "o":  # logo circular entre letras y números
        cx, cy, rr = W / 2 + rng.uniform(-6, 6), ty + th * 0.5, th * 0.09
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=ink, width=2)
    city = rng.choice(CITIES)
    if city:
        cf, (cl, ct, cr, cb) = _fit_text(d, city, font_path, W * 0.7, H * 0.15, 26)
        d.text(((W - (cr - cl)) / 2 - cl, H * 0.80 - ct), city, font=cf, fill=ink)
    for x in (W * 0.12, W * 0.88):  # tornillos
        for y in (H * 0.12, H * 0.88):
            if rng.random() < 0.7:
                rr = rng.randint(3, 6)
                d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=tuple(int(c * 0.6) for c in yellow))
    return im


def _perspective_coeffs(src, dst):
    a = []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    A = np.array(a, dtype=np.float64)
    B = np.array(src, dtype=np.float64).reshape(8)
    return np.linalg.solve(A, B).tolist()


def degrade(plate: Image.Image, rng: random.Random) -> Image.Image:
    """Simula cámara real: perspectiva, contexto alrededor, luz, desenfoque, ruido y JPEG."""
    W, H = plate.size
    pad = int(H * rng.uniform(0.15, 0.45))
    bg = tuple(rng.randint(20, 230) for _ in range(3))
    canvas = Image.new("RGB", (W + 2 * pad, H + 2 * pad), bg)
    canvas.paste(plate, (pad, pad))
    cw, ch = canvas.size
    j = 0.035
    src = [(0, 0), (cw, 0), (cw, ch), (0, ch)]
    dst = [(x + rng.uniform(-j, j) * cw, y + rng.uniform(-j, j) * ch) for x, y in src]
    canvas = canvas.transform((cw, ch), Image.Transform.PERSPECTIVE, _perspective_coeffs(src, dst),
                              resample=Image.Resampling.BILINEAR, fillcolor=bg)
    canvas = canvas.rotate(rng.uniform(-5, 5), resample=Image.Resampling.BILINEAR, fillcolor=bg)
    # recorte como el de un detector: placa completa con margen variable
    m = pad * rng.uniform(0.45, 0.95)  # el margen cubre la deformación: nunca corta caracteres
    canvas = canvas.crop((pad - m + rng.uniform(-4, 4), pad - m * rng.uniform(0.5, 1.2),
                          pad + W + m + rng.uniform(-4, 4), pad + H + m * rng.uniform(0.5, 1.2)))
    # baja resolución (placas lejanas) y vuelta a escala
    scale = rng.uniform(0.18, 0.9)
    small = canvas.resize((max(16, int(canvas.width * scale)), max(8, int(canvas.height * scale))),
                          Image.Resampling.BILINEAR)
    arr = np.asarray(small).astype(np.float32)
    arr = arr * rng.uniform(0.45, 1.35) + rng.uniform(-40, 40)  # brillo/contraste
    if rng.random() < 0.4:  # sombra lineal
        g = np.linspace(rng.uniform(0.4, 1.0), rng.uniform(0.7, 1.1), arr.shape[1])[None, :, None]
        arr = arr * g
    arr += np.random.default_rng(rng.randint(0, 2**31)).normal(0, rng.uniform(0, 14), arr.shape)
    small = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    if rng.random() < 0.5:
        small = small.filter(ImageFilter.GaussianBlur(rng.uniform(0.2, 1.3)))
    buf = io.BytesIO()
    small.save(buf, format="JPEG", quality=rng.randint(25, 95))
    return Image.open(io.BytesIO(buf.getvalue())).convert("RGB")


def make_sample(rng: random.Random) -> tuple[Image.Image, str]:
    text = random_plate_text(rng)
    return degrade(render_plate(text, rng), rng), text


if __name__ == "__main__":  # vista previa
    r = random.Random(0)
    tiles = [make_sample(r) for _ in range(24)]
    sheet = Image.new("RGB", (4 * 200, 6 * 90), "white")
    for k, (im, t) in enumerate(tiles):
        im = im.resize((200, 80))
        sheet.paste(im, ((k % 4) * 200, (k // 4) * 90))
    out = Path(__file__).resolve().parent / "runs" / "synth_preview.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(out, [t for _, t in tiles])
