"""Generador de escenas sintéticas (calle / parqueadero) con vehículos y placas.

Todo es simulado: las placas tienen formato ``AAA-123`` (letras sin I, O, Q),
fondo amarillo, borde negro y una ciudad ficticia en la franja inferior.

La generación es determinista dado ``seed``: se usan ``random.Random(seed)`` y
``numpy.random.default_rng(seed)`` y nunca el estado global.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .fonts import get_font

SCENE_W, SCENE_H = 960, 600
HORIZON = 185
LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ"  # sin I, O, Q
DIGITS = "0123456789"
PLATE_YELLOW = (250, 204, 21)
CITIES = [
    "CIUDAD SIM", "VILLA NOVA", "PUERTO SIM", "SAN FICTO", "MONTE ALBO",
    "RIO VERDE", "VALLE SIM", "NUEVA AURA", "SANTA LUZ", "BAHIA SIM",
]
DIFFICULTIES = ("easy", "medium", "hard")

# Parámetros por dificultad.
DIFFICULTY_PARAMS = {
    "easy": dict(rot=0.0, plate_w=(120, 160), noise=(0.0, 3.0), blur=(0.0, 0.0),
                 bright=(0.92, 1.08), contrast=(0.95, 1.05), shadow_p=0.0,
                 shadow_strength=(0.0, 0.0), yellow_line_p=0.2),
    "medium": dict(rot=3.0, plate_w=(104, 145), noise=(3.0, 7.0), blur=(0.0, 0.7),
                   bright=(0.80, 1.15), contrast=(0.85, 1.05), shadow_p=0.45,
                   shadow_strength=(0.20, 0.38), yellow_line_p=0.3),
    "hard": dict(rot=6.0, plate_w=(88, 125), noise=(7.0, 12.0), blur=(0.6, 1.2),
                 bright=(0.65, 1.25), contrast=(0.72, 1.0), shadow_p=0.8,
                 shadow_strength=(0.30, 0.50), yellow_line_p=0.4),
}

CAR_COLORS = [
    (235, 235, 232), (200, 203, 208), (150, 154, 160), (60, 62, 66), (25, 26, 30),
    (180, 30, 35), (120, 20, 30), (30, 70, 150), (20, 40, 90), (35, 90, 60),
    (110, 115, 90), (215, 205, 180), (90, 60, 45), (70, 130, 170), (150, 30, 90),
]
TAXI_COLORS = [(245, 195, 20), (238, 185, 30), (250, 210, 40)]


@dataclass
class PlateTruth:
    text: str
    bbox: list[int]  # [x, y, w, h] en la imagen final
    corners: list[list[float]] = field(default_factory=list)
    city: str = ""


@dataclass
class GeneratedScene:
    image: Image.Image  # RGB 960x600
    plates: list[PlateTruth]
    seed: int
    difficulty: str

    @property
    def ground_truth(self) -> list[dict]:
        return [{"text": p.text, "bbox": list(p.bbox)} for p in self.plates]


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def random_plate_text(rng: random.Random) -> str:
    letters = "".join(rng.choice(LETTERS) for _ in range(3))
    digits = "".join(rng.choice(DIGITS) for _ in range(3))
    return f"{letters}-{digits}"


def _shade(color, f):
    return tuple(int(max(0, min(255, c * f))) for c in color)


def _render_text(text: str, size: int = 200) -> Image.Image:
    """Texto negro sobre transparente, recortado a su caja de tinta."""
    font = get_font(size)
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    l, t, r, b = probe.textbbox((0, 0), text, font=font)
    img = Image.new("L", (r - l + 8, b - t + 8), 0)
    ImageDraw.Draw(img).text((4 - l, 4 - t), text, font=font, fill=255)
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def _render_spaced_text(text: str, size: int = 200, gap: float = 0.16) -> Image.Image:
    """Texto con espaciado fijo entre glifos (sobre línea base común), recortado a la tinta."""
    font = get_font(size)
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    _, ct, _, cb = probe.textbbox((0, 0), "H", font=font)
    cap = cb - ct
    boxes = [probe.textbbox((0, 0), ch, font=font) for ch in text]
    gap_px = int(gap * cap)
    total = sum(b[2] - b[0] for b in boxes) + gap_px * (len(text) - 1) + 20
    img = Image.new("L", (total, int(size * 1.6)), 0)
    d = ImageDraw.Draw(img)
    x = 10
    for ch, (l, t, r, b) in zip(text, boxes):
        d.text((x - l, 20), ch, font=font, fill=255)
        x += (r - l) + gap_px
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


# --------------------------------------------------------------------------- #
# Placa
# --------------------------------------------------------------------------- #
def render_plate(text: str, city: str, w: int, h: int) -> Image.Image:
    """Renderiza la placa (RGBA) a tamaño ``w``x``h`` con superresolución 4x."""
    ss = 4
    W, H = w * ss, h * ss
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    border = max(2 * ss, int(round(0.07 * H)))
    d.rounded_rectangle([0, 0, W - 1, H - 1], radius=int(0.10 * H),
                        fill=PLATE_YELLOW + (255,), outline=(15, 15, 15, 255), width=border)

    # Texto principal (condensado y espaciado como en placas reales).
    main = _render_spaced_text(text)
    tw, th = int(0.80 * W), int(0.50 * H)
    main = main.resize((tw, th), Image.LANCZOS)
    ink = Image.new("RGBA", main.size, (12, 12, 12, 255))
    img.paste(ink, ((W - tw) // 2, int(0.14 * H)), main)

    # Franja inferior con la ciudad ficticia.
    ct = _render_text(city)
    ch = int(0.12 * H)
    cw = min(int(ct.width * ch / ct.height), int(0.62 * W))
    ct = ct.resize((cw, ch), Image.LANCZOS)
    ink = Image.new("RGBA", ct.size, (20, 20, 20, 255))
    img.paste(ink, ((W - cw) // 2, int(0.735 * H)), ct)
    return img.resize((w, h), Image.LANCZOS)


# --------------------------------------------------------------------------- #
# Vehículo (vista frontal), dibujado a 2x
# --------------------------------------------------------------------------- #
def draw_vehicle(rng: random.Random, car_w: int, plate_w: int, text: str, city: str,
                 color) -> tuple[Image.Image, list[tuple[float, float]]]:
    """Devuelve el sprite RGBA del vehículo (a 2x) y las esquinas de la placa."""
    s = 2
    W = car_w * s
    H = int(W * 0.78)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def X(f):
        return int(f * W)

    def Y(f):
        return int(f * H)

    body = tuple(color)
    dark = _shade(body, 0.72)
    light = _shade(body, 1.12)
    tire = (22, 22, 24)

    # Ruedas (detrás de la carrocería).
    for x0, x1 in ((0.04, 0.21), (0.79, 0.96)):
        d.rounded_rectangle([X(x0), Y(0.74), X(x1), Y(0.99)], radius=X(0.03), fill=tire)
    # Cabina y techo.
    roof_in = rng.uniform(0.17, 0.23)
    d.polygon([(X(roof_in), Y(0.03)), (X(1 - roof_in), Y(0.03)), (X(0.91), Y(0.38)),
               (X(0.09), Y(0.38))], fill=light)
    # Parabrisas con reflejo.
    glass = (38, 52, 66)
    d.polygon([(X(roof_in + 0.04), Y(0.07)), (X(1 - roof_in - 0.04), Y(0.07)),
               (X(0.86), Y(0.36)), (X(0.14), Y(0.36))], fill=glass)
    rx = rng.uniform(0.3, 0.55)
    d.polygon([(X(rx), Y(0.08)), (X(rx + 0.08), Y(0.08)), (X(rx - 0.02), Y(0.35)),
               (X(rx - 0.10), Y(0.35))], fill=(70, 88, 104))
    # Espejos.
    d.polygon([(X(0.02), Y(0.29)), (X(0.10), Y(0.30)), (X(0.10), Y(0.37)), (X(0.03), Y(0.37))], fill=dark)
    d.polygon([(X(0.98), Y(0.29)), (X(0.90), Y(0.30)), (X(0.90), Y(0.37)), (X(0.97), Y(0.37))], fill=dark)
    # Carrocería.
    d.rounded_rectangle([X(0.0), Y(0.35), X(1.0), Y(0.86)], radius=X(0.06), fill=body)
    d.line([(X(0.06), Y(0.41)), (X(0.94), Y(0.41))], fill=dark, width=max(2, X(0.006)))
    # Faros.
    for x0, x1 in ((0.05, 0.28), (0.72, 0.95)):
        d.rounded_rectangle([X(x0), Y(0.44), X(x1), Y(0.54)], radius=X(0.02),
                            fill=(218, 224, 232), outline=(90, 95, 100), width=max(1, X(0.004)))
        cx = X((x0 + x1) / 2)
        r = X(0.03)
        d.ellipse([cx - r, Y(0.49) - r, cx + r, Y(0.49) + r], fill=(250, 252, 255),
                  outline=(160, 165, 170))
    # Parrilla.
    d.rounded_rectangle([X(0.33), Y(0.44), X(0.67), Y(0.56)], radius=X(0.015), fill=(32, 33, 36))
    for i in range(1, 4):
        yy = Y(0.44 + i * 0.03)
        d.line([(X(0.35), yy), (X(0.65), yy)], fill=(85, 88, 92), width=max(1, X(0.004)))
    d.ellipse([X(0.475), Y(0.475), X(0.525), Y(0.525)], fill=(190, 192, 196))
    # Parachoques.
    d.rounded_rectangle([X(0.01), Y(0.59), X(0.99), Y(0.86)], radius=X(0.04), fill=dark)
    for cx in (0.12, 0.88):
        r = X(0.025)
        d.ellipse([X(cx) - r, Y(0.70) - r, X(cx) + r, Y(0.70) + r], fill=(200, 200, 195),
                  outline=(60, 60, 60))
    d.rectangle([X(0.30), Y(0.84), X(0.70), Y(0.855)], fill=(28, 28, 30))

    # Sombreado vertical (volumen).
    arr = np.asarray(img).astype(np.float32)
    grad = np.linspace(1.10, 0.86, H, dtype=np.float32)[:, None, None]
    arr[..., :3] *= grad
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(img)

    # Placa (en hueco oscuro del parachoques).
    pw = plate_w * s
    ph = int(round(pw / rng.uniform(2.55, 2.95)))
    px0 = (W - pw) // 2
    py0 = Y(0.62)
    if py0 + ph > Y(0.83):
        py0 = Y(0.83) - ph
    pad = max(3, int(0.06 * ph))
    d.rounded_rectangle([px0 - pad, py0 - pad, px0 + pw + pad, py0 + ph + pad],
                        radius=pad, fill=(24, 24, 27))
    plate = render_plate(text, city, pw, ph)
    img.alpha_composite(plate, (px0, py0))
    corners = [(px0, py0), (px0 + pw, py0), (px0 + pw, py0 + ph), (px0, py0 + ph)]
    return img, corners


def _rotate_points(points, angle_deg, size, new_size):
    a = math.radians(angle_deg)
    cx, cy = size[0] / 2.0, size[1] / 2.0
    ncx, ncy = new_size[0] / 2.0, new_size[1] / 2.0
    out = []
    for x, y in points:
        dx, dy = x - cx, y - cy
        out.append((dx * math.cos(a) + dy * math.sin(a) + ncx,
                    -dx * math.sin(a) + dy * math.cos(a) + ncy))
    return out


# --------------------------------------------------------------------------- #
# Fondo
# --------------------------------------------------------------------------- #
def draw_background(rng: random.Random, nrng: np.random.Generator, yellow_lines: bool) -> Image.Image:
    img = Image.new("RGB", (SCENE_W, SCENE_H))
    arr = np.zeros((SCENE_H, SCENE_W, 3), np.float32)
    # Cielo.
    top = np.array([rng.uniform(100, 140), rng.uniform(150, 185), rng.uniform(205, 235)])
    hor = np.array([205, 222, 236], np.float32)
    t = np.linspace(0, 1, HORIZON)[:, None, None]
    arr[:HORIZON] = top * (1 - t) + hor * t
    # Asfalto con textura.
    base = rng.uniform(62, 82)
    g = np.linspace(0.92, 1.05, SCENE_H - HORIZON)[:, None]
    tex = nrng.normal(0, 6, (SCENE_H - HORIZON, SCENE_W))
    coarse = nrng.normal(0, 1, ((SCENE_H - HORIZON) // 20 + 1, SCENE_W // 20 + 1))
    coarse = np.kron(coarse, np.ones((20, 20)))[: SCENE_H - HORIZON, :SCENE_W] * 4
    asphalt = base * g + tex + coarse
    arr[HORIZON:] = np.stack([asphalt, asphalt, asphalt * 1.04], -1)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)

    # Edificios.
    x = -rng.randint(0, 40)
    while x < SCENE_W:
        bw = rng.randint(70, 160)
        bh = rng.randint(60, HORIZON - 15)
        col = rng.choice([(150, 140, 130), (120, 110, 105), (170, 160, 150), (140, 85, 70),
                          (110, 120, 130), (185, 180, 170), (95, 100, 110)])
        d.rectangle([x, HORIZON - bh, x + bw, HORIZON], fill=col)
        win = rng.choice([(160, 185, 205), (90, 105, 120), (200, 210, 220)])
        for wy in range(HORIZON - bh + 10, HORIZON - 14, 18):
            for wx in range(x + 8, x + bw - 12, 16):
                if rng.random() < 0.85:
                    d.rectangle([wx, wy, wx + 8, wy + 10], fill=win)
        x += bw + rng.randint(0, 12)
    # Andén y bordillo.
    d.rectangle([0, HORIZON, SCENE_W, HORIZON + 16], fill=(165, 163, 158))
    d.rectangle([0, HORIZON + 16, SCENE_W, HORIZON + 21], fill=(120, 118, 114))
    # Líneas de parqueo en perspectiva.
    line_col = (232, 196, 30) if yellow_lines else (225, 225, 220)
    vx = SCENE_W / 2 + rng.uniform(-120, 120)
    for i in range(-2, 9):
        xb = i * 150 + rng.uniform(-10, 10)
        xt = vx + (xb - vx) * 0.35
        d.line([(xb, SCENE_H), (xt, HORIZON + 24)], fill=line_col, width=6)
    d.line([(0, HORIZON + 40), (SCENE_W, HORIZON + 40)], fill=line_col, width=4)
    # Manchas de aceite.
    for _ in range(rng.randint(2, 6)):
        cx, cy = rng.uniform(0, SCENE_W), rng.uniform(HORIZON + 40, SCENE_H)
        rx, ry = rng.uniform(15, 50), rng.uniform(5, 14)
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(48, 48, 52))
    return img


def _apply_shadows(arr: np.ndarray, rng: random.Random, strength: float, plates_boxes) -> np.ndarray:
    """Sombras suaves (postes, árboles) multiplicativas; a veces cruzan placas."""
    mask = Image.new("L", (SCENE_W, SCENE_H), 0)
    d = ImageDraw.Draw(mask)
    for _ in range(rng.randint(1, 3)):
        if plates_boxes and rng.random() < 0.7:
            bx, by, bw, bh = rng.choice(plates_boxes)
            cx, cy = bx + rng.uniform(0, bw), by + rng.uniform(0, bh)
        else:
            cx, cy = rng.uniform(0, SCENE_W), rng.uniform(HORIZON, SCENE_H)
        if rng.random() < 0.5:  # banda diagonal (poste)
            ang = math.radians(rng.uniform(20, 160))
            half = rng.uniform(12, 45)
            L = 900
            dx, dy = math.cos(ang), math.sin(ang)
            nx, ny = -dy * half, dx * half
            d.polygon([(cx - dx * L + nx, cy - dy * L + ny), (cx + dx * L + nx, cy + dy * L + ny),
                       (cx + dx * L - nx, cy + dy * L - ny), (cx - dx * L - nx, cy - dy * L - ny)], fill=255)
        else:  # copa de árbol
            for _ in range(rng.randint(3, 6)):
                ox, oy = cx + rng.uniform(-60, 60), cy + rng.uniform(-40, 40)
                r = rng.uniform(25, 60)
                d.ellipse([ox - r, oy - r, ox + r, oy + r], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(rng.uniform(3, 8)))
    m = np.asarray(mask, np.float32)[..., None] / 255.0
    m[:HORIZON] = 0.0  # las sombras sólo caen sobre el suelo y los vehículos
    return arr * (1 - strength * m)


# --------------------------------------------------------------------------- #
# Escena
# --------------------------------------------------------------------------- #
def generate_scene(seed: int | None = None, difficulty: str = "medium",
                   n_vehicles: int | None = None) -> GeneratedScene:
    if difficulty not in DIFFICULTY_PARAMS:
        raise ValueError(f"dificultad inválida: {difficulty}")
    if seed is None:
        seed = random.SystemRandom().randint(0, 2**31 - 1)
    p = DIFFICULTY_PARAMS[difficulty]
    rng = random.Random(f"{seed}-{difficulty}")
    nrng = np.random.default_rng([seed, DIFFICULTIES.index(difficulty)])

    img = draw_background(rng, nrng, rng.random() < p["yellow_line_p"])
    n = n_vehicles or rng.choice([1, 2, 2, 3, 3])
    slot = SCENE_W / n
    plates: list[PlateTruth] = []
    used_texts = set()

    for i in range(n):
        text = random_plate_text(rng)
        while text in used_texts:
            text = random_plate_text(rng)
        used_texts.add(text)
        city = rng.choice(CITIES)
        plate_w = rng.uniform(*p["plate_w"])
        ratio = rng.uniform(0.38, 0.46)
        car_w = plate_w / ratio
        max_w = slot * 0.90
        if car_w > max_w:
            car_w = max_w
            plate_w = car_w * ratio
        car_w, plate_w = int(car_w), int(plate_w)
        color = rng.choice(TAXI_COLORS) if rng.random() < 0.15 else rng.choice(CAR_COLORS)
        sprite, corners = draw_vehicle(rng, car_w, plate_w, text, city, color)
        angle = rng.uniform(-p["rot"], p["rot"]) if p["rot"] > 0 else 0.0
        if angle:
            rot = sprite.rotate(angle, resample=Image.BICUBIC, expand=True)
            corners = _rotate_points(corners, angle, sprite.size, rot.size)
            sprite = rot
        sprite = sprite.resize((sprite.width // 2, sprite.height // 2), Image.LANCZOS)
        corners = [(x / 2.0, y / 2.0) for x, y in corners]

        sw, sh = sprite.size
        x0 = int(i * slot + rng.uniform(0, max(1.0, slot - sw)))
        x0 = max(-int(0.05 * sw), min(SCENE_W - int(0.95 * sw), x0))
        bottom = rng.uniform(max(HORIZON + sh + 30, 470), 592)
        y0 = int(min(bottom, SCENE_H - 4) - sh)
        y0 = max(HORIZON + 25, y0)

        # Sombra del vehículo sobre el suelo.
        sh_layer = Image.new("L", (SCENE_W, SCENE_H), 0)
        cx = x0 + sw / 2
        ImageDraw.Draw(sh_layer).ellipse([cx - sw * 0.55, y0 + sh - sh * 0.10,
                                          cx + sw * 0.55, y0 + sh + sh * 0.06], fill=170)
        sh_layer = sh_layer.filter(ImageFilter.GaussianBlur(8))
        img = Image.composite(Image.new("RGB", img.size, (15, 15, 18)), img, sh_layer)
        img.paste(sprite, (x0, y0), sprite)

        pts = [(x + x0, y + y0) for x, y in corners]
        xs, ys = [q[0] for q in pts], [q[1] for q in pts]
        bx0, by0 = max(0, math.floor(min(xs))), max(0, math.floor(min(ys)))
        bx1, by1 = min(SCENE_W, math.ceil(max(xs))), min(SCENE_H, math.ceil(max(ys)))
        plates.append(PlateTruth(text=text, bbox=[bx0, by0, bx1 - bx0, by1 - by0],
                                 corners=[[round(x, 2), round(y, 2)] for x, y in pts], city=city))

    # Degradaciones fotométricas según dificultad.
    arr = np.asarray(img).astype(np.float32)
    if p["shadow_p"] > 0 and rng.random() < p["shadow_p"]:
        arr = _apply_shadows(arr, rng, rng.uniform(*p["shadow_strength"]),
                             [pl.bbox for pl in plates])
    c = rng.uniform(*p["contrast"])
    b = rng.uniform(*p["bright"])
    mean = arr.mean()
    arr = ((arr - mean) * c + mean) * b
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    blur = rng.uniform(*p["blur"])
    if blur > 0.05:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    sigma = rng.uniform(*p["noise"])
    if sigma > 0.1:
        arr = np.asarray(img).astype(np.float32) + nrng.normal(0, sigma, (SCENE_H, SCENE_W, 3))
        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    return GeneratedScene(image=img, plates=plates, seed=seed, difficulty=difficulty)
