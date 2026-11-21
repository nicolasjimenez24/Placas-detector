"""Motor de detección y lectura de placas (OpenCV + numpy).

Pipeline (no usa el ground truth en ningún momento):

1. Preprocesado: suavizado de mediana y conversión BGR -> HSV.
2. Máscara de color amarillo + morfología.
3. Contornos externos (RETR_CCOMP, nivel superior) filtrados por área,
   relación de aspecto, rectangularidad e inclinación.
4. Enderezado con ``minAreaRect`` + ``warpPerspective`` a altura normalizada.
5. Binarización robusta a sombras (oscuridad relativa al fondo local + Otsu)
   y segmentación de caracteres por componentes conectados, ignorando el
   borde y la franja inferior con la ciudad.
6. OCR por *template matching* (correlación normalizada) contra glifos
   renderizados con la misma fuente que el generador, con aumentos
   (rotación, grosor, baja resolución) generados en memoria y cacheados.
7. Validación del formato ``AAA-123`` con corrección posición-dependiente.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageDraw

from .fonts import get_font

LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ"  # sin I, O, Q
DIGITS = "0123456789"
ALPHABET = LETTERS + DIGITS
PLATE_RE = re.compile(r"^[A-HJ-NPR-Z]{3}-[0-9]{3}$")

GLYPH_W, GLYPH_H = 24, 36  # tamaño normalizado de cada glifo para la correlación
NORM_H = 72  # altura normalizada del interior amarillo enderezado

# Correcciones posición-dependientes (confusiones típicas del OCR).
TO_LETTER = {"0": "D", "8": "B", "5": "S", "2": "Z", "6": "G", "1": "L", "4": "A",
             "7": "T", "3": "B", "9": "P"}
TO_DIGIT = {"D": "0", "B": "8", "S": "5", "Z": "2", "G": "6", "L": "1", "T": "7",
            "A": "4", "J": "1", "U": "0", "C": "0", "E": "3", "P": "9"}

# Rango HSV (OpenCV: H 0-180) del amarillo de placa.
YELLOW_LO = np.array([14, 85, 55], np.uint8)
YELLOW_HI = np.array([38, 255, 255], np.uint8)


# --------------------------------------------------------------------------- #
# Estructuras de salida
# --------------------------------------------------------------------------- #
@dataclass
class CharResult:
    char: str
    confidence: float


@dataclass
class PlateResult:
    text: str
    confidence: float
    bbox: list[int]
    chars: list[CharResult]
    valid_format: bool
    crop: np.ndarray  # BGR
    polygon: np.ndarray  # 4x2 float (placa completa, con borde)


@dataclass
class DetectionResult:
    plates: list[PlateResult]
    annotated: np.ndarray  # BGR
    stages: list[dict] = field(default_factory=list)
    processing_ms: float = 0.0
    width: int = 0
    height: int = 0


class _Timer:
    def __init__(self):
        self.stages: dict[str, float] = {}
        self._t = time.perf_counter()

    def lap(self, name: str):
        now = time.perf_counter()
        self.stages[name] = self.stages.get(name, 0.0) + (now - self._t) * 1000.0
        self._t = now


# --------------------------------------------------------------------------- #
# Plantillas OCR
# --------------------------------------------------------------------------- #
def _normalize_glyph(binary: np.ndarray) -> np.ndarray | None:
    """Recorta a la caja de tinta, escala a GLYPH_WxGLYPH_H y normaliza (media 0, norma 1)."""
    ys, xs = np.nonzero(binary)
    if len(xs) == 0:
        return None
    patch = binary[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1].astype(np.float32)
    patch = cv2.resize(patch, (GLYPH_W, GLYPH_H), interpolation=cv2.INTER_AREA)
    patch = cv2.GaussianBlur(patch, (3, 3), 0.8)
    v = patch.ravel() - patch.mean()
    n = np.linalg.norm(v)
    return v / n if n > 1e-6 else None


def _render_glyph(ch: str, size: int = 120) -> np.ndarray:
    font = get_font(size)
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    l, t, r, b = probe.textbbox((0, 0), ch, font=font)
    img = Image.new("L", (r - l + 40, b - t + 40), 0)
    ImageDraw.Draw(img).text((20 - l, 20 - t), ch, font=font, fill=255)
    return (np.asarray(img) > 127).astype(np.uint8) * 255


@lru_cache(maxsize=1)
def get_templates() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Plantillas aumentadas: (matriz NxD, índice de clase por fila, aspecto medio por clase)."""
    vecs, labels, aspects = [], [], np.zeros(len(ALPHABET), np.float32)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    for ci, ch in enumerate(ALPHABET):
        base = _render_glyph(ch)
        ys, xs = np.nonzero(base)
        aspects[ci] = (xs.max() - xs.min() + 1) / (ys.max() - ys.min() + 1)
        h, w = base.shape
        for ang in (-2.5, 0.0, 2.5):
            M = cv2.getRotationMatrix2D((w / 2, h / 2), ang, 1.0)
            rot = cv2.warpAffine(base, M, (w, h), flags=cv2.INTER_LINEAR)
            rot = (rot > 127).astype(np.uint8) * 255
            for morph in ("erode", "none", "dilate"):
                if morph == "erode":
                    g = cv2.erode(rot, k)
                elif morph == "dilate":
                    g = cv2.dilate(rot, k)
                else:
                    g = rot
                for lowres in (False, True):
                    gg = g
                    if lowres:  # simula caracteres pequeños re-escalados
                        ys2, xs2 = np.nonzero(g)
                        crop = g[ys2.min(): ys2.max() + 1, xs2.min(): xs2.max() + 1]
                        sm = cv2.resize(crop, (max(4, crop.shape[1] * 18 // crop.shape[0]), 18),
                                        interpolation=cv2.INTER_AREA)
                        gg = cv2.resize(sm, (crop.shape[1], crop.shape[0]), interpolation=cv2.INTER_CUBIC)
                        gg = (gg > 127).astype(np.uint8) * 255
                    v = _normalize_glyph(gg)
                    if v is not None:
                        vecs.append(v)
                        labels.append(ci)
    return np.stack(vecs).astype(np.float32), np.array(labels), aspects


def warmup() -> None:
    get_templates()


# --------------------------------------------------------------------------- #
# Geometría
# --------------------------------------------------------------------------- #
def _order_box(rect) -> np.ndarray:
    """Puntos TL, TR, BR, BL con el lado largo como horizontal."""
    pts = cv2.boxPoints(rect).astype(np.float32)
    c = pts.mean(axis=0)
    # Dirección del lado largo.
    e1, e2 = pts[1] - pts[0], pts[2] - pts[1]
    u = e1 if np.linalg.norm(e1) >= np.linalg.norm(e2) else e2
    u = u / (np.linalg.norm(u) + 1e-9)
    if u[0] < 0:
        u = -u
    v = np.array([-u[1], u[0]], np.float32)
    if v[1] < 0:
        v = -v
    out = np.zeros((4, 2), np.float32)
    for p in pts:
        a, b = np.dot(p - c, u), np.dot(p - c, v)
        idx = (0 if b < 0 else 3) if a < 0 else (1 if b < 0 else 2)
        out[idx] = p
    return out


def _expand_box(box: np.ndarray, dx: float, dy: float) -> np.ndarray:
    tl, tr, br, bl = box
    u = (tr - tl) / (np.linalg.norm(tr - tl) + 1e-9)
    v = (bl - tl) / (np.linalg.norm(bl - tl) + 1e-9)
    return np.array([tl - u * dx - v * dy, tr + u * dx - v * dy,
                     br + u * dx + v * dy, bl - u * dx + v * dy], np.float32)


def _warp(img: np.ndarray, box: np.ndarray, out_w: int, out_h: int) -> np.ndarray:
    dst = np.array([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]], np.float32)
    M = cv2.getPerspectiveTransform(box.astype(np.float32), dst)
    return cv2.warpPerspective(img, M, (out_w, out_h), flags=cv2.INTER_CUBIC,
                               borderMode=cv2.BORDER_REPLICATE)


# --------------------------------------------------------------------------- #
# Segmentación y OCR
# --------------------------------------------------------------------------- #
def _binarize(plate_bgr: np.ndarray) -> np.ndarray:
    """Caracteres oscuros -> 255. Normaliza por el fondo local (robusto a sombras)."""
    v = plate_bgr.max(axis=2).astype(np.float32)
    v = cv2.GaussianBlur(v, (3, 3), 0)
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    bg = cv2.morphologyEx(v, cv2.MORPH_CLOSE, k)
    bg = cv2.GaussianBlur(bg, (9, 9), 0)
    dark = np.clip(1.0 - v / np.maximum(bg, 1.0), 0, 1)
    d8 = (dark * 255).astype(np.uint8)
    thr, _ = cv2.threshold(d8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    thr = max(thr, 0.30 * 255)
    return (d8 > thr).astype(np.uint8) * 255


def _segment(binary: np.ndarray) -> list[tuple[int, int, int, int, np.ndarray]]:
    """Devuelve cajas (x, y, w, h, máscara) de los caracteres principales, ordenadas por x."""
    H, W = binary.shape
    n, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    comps = []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if a < 12:
            continue
        if x <= 0 or y <= 0 or x + w >= W or y + h >= H:  # restos del borde
            if h > 0.9 * H or w > 0.5 * W or y + h >= H or y <= 0:
                continue
        cy = y + h / 2
        if cy > 0.72 * H:  # franja inferior (ciudad)
            continue
        comps.append([x, y, w, h, [i]])
    # Fusiona piezas de un mismo carácter (solapamiento horizontal fuerte).
    comps.sort(key=lambda c: c[0])
    merged = []
    for c in comps:
        if merged:
            m = merged[-1]
            ov = min(m[0] + m[2], c[0] + c[2]) - max(m[0], c[0])
            if ov > 0.2 * min(m[2], c[2]):
                x0, y0 = min(m[0], c[0]), min(m[1], c[1])
                x1, y1 = max(m[0] + m[2], c[0] + c[2]), max(m[1] + m[3], c[1] + c[3])
                merged[-1] = [x0, y0, x1 - x0, y1 - y0, m[4] + c[4]]
                continue
        merged.append(c)
    # Filtro por altura (descarta guion, tornillos, ruido y la ciudad).
    cands = [c for c in merged if 0.35 * H <= c[3] <= 0.88 * H and c[1] < 0.45 * H and c[2] < 1.3 * c[3]]
    if not cands:
        return []
    med_h = float(np.median([c[3] for c in cands]))
    cands = [c for c in cands if abs(c[3] - med_h) <= 0.25 * med_h]
    # Separa caracteres pegados (componentes demasiado anchos).
    if cands:
        widths = sorted(c[2] for c in cands)
        ref_w = float(np.median(widths))
        out = []
        for c in cands:
            parts = int(round(c[2] / max(ref_w, 1)))
            if len(cands) < 6 and c[2] > 1.55 * ref_w and parts >= 2:
                pw = c[2] / parts
                for k in range(parts):
                    out.append([int(c[0] + k * pw), c[1], int(pw), c[3], c[4]])
            else:
                out.append(c)
        cands = out
    # Si sobran, fusiona primero piezas vecinas muy próximas (carácter partido,
    # p. ej. una M cuyo trazo central se perdió) si el resultado es plausible.
    cands.sort(key=lambda c: c[0])
    while len(cands) > 6:
        best, best_gap = -1, 1e9
        for k in range(len(cands) - 1):
            a, b = cands[k], cands[k + 1]
            gap = b[0] - (a[0] + a[2])
            width = max(a[0] + a[2], b[0] + b[2]) - a[0]
            if width <= 0.95 * med_h and gap < best_gap:
                best, best_gap = k, gap
        if best < 0 or best_gap > 0.06 * H:
            break
        a, b = cands[best], cands[best + 1]
        x0, y0 = a[0], min(a[1], b[1])
        x1, y1 = max(a[0] + a[2], b[0] + b[2]), max(a[1] + a[3], b[1] + b[3])
        cands[best: best + 2] = [[x0, y0, x1 - x0, y1 - y0, a[4] + b[4]]]
    # Si aún sobran, conserva los 6 de altura más parecida a la mediana.
    if len(cands) > 6:
        cands.sort(key=lambda c: abs(c[3] - med_h))
        cands = cands[:6]
    cands.sort(key=lambda c: c[0])
    result = []
    for x, y, w, h, ids in cands:
        mask = np.isin(labels[y: y + h, x: x + w], ids).astype(np.uint8) * 255
        result.append((x, y, w, h, mask))
    return result


def _classify(mask: np.ndarray, allowed: str) -> tuple[str, float, str]:
    """Devuelve (carácter elegido, confianza 0-1, mejor carácter sin restricción)."""
    T, labels, _ = get_templates()
    q = _normalize_glyph(mask)
    if q is None:
        return (allowed[0], 0.0, "?")
    scores = T @ q
    per_class = np.full(len(ALPHABET), -1.0, np.float32)
    np.maximum.at(per_class, labels, scores)
    raw_idx = int(np.argmax(per_class))
    raw = ALPHABET[raw_idx]
    allowed_idx = [ALPHABET.index(c) for c in allowed]
    best_allowed = max(allowed_idx, key=lambda i: per_class[i])
    choice = ALPHABET[best_allowed]
    corrected = False
    if raw not in allowed:
        table = TO_LETTER if allowed == LETTERS else TO_DIGIT
        mapped = table.get(raw)
        if mapped and per_class[ALPHABET.index(mapped)] >= per_class[best_allowed] - 0.05:
            choice = mapped
        corrected = True
    s = float(per_class[ALPHABET.index(choice)])
    # Margen frente al segundo mejor candidato permitido.
    others = sorted((per_class[i] for i in allowed_idx if ALPHABET[i] != choice), reverse=True)
    margin = s - float(others[0]) if others else 0.2
    conf = np.clip((s - 0.5) / 0.5, 0, 1) * (0.7 + 0.3 * min(1.0, max(0.0, margin) / 0.25))
    if corrected:
        conf *= 0.85
    return choice, float(np.clip(conf, 0, 1)), raw


# --------------------------------------------------------------------------- #
# Pipeline principal
# --------------------------------------------------------------------------- #
def _candidates(img: np.ndarray, timer: _Timer):
    H, W = img.shape[:2]
    blurred = cv2.medianBlur(img, 5)
    hsv = cv2.cvtColor(blurred, cv2.COLOR_BGR2HSV)
    timer.lap("preprocesado")

    mask = cv2.inRange(hsv, YELLOW_LO, YELLOW_HI)
    k3 = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k3)  # elimina ruido aislado
    timer.lap("mascara_amarilla")

    area_img = float(H * W)
    min_area = max(250.0, 0.0008 * area_img)
    max_area = 0.08 * area_img
    out = []
    # Dos pasadas: máscara original y máscara erosionada. La erosión rompe
    # puentes finos (p. ej. placa amarilla sobre un vehículo amarillo cuando el
    # borde negro se difumina); la caja se re-expande lo erosionado.
    for erode_px in (0, 2, 4):
        m = mask if erode_px == 0 else cv2.erode(mask, k3, iterations=erode_px)
        out.extend(_contour_candidates(m, min_area, max_area, erode_px))
    # Pasada adicional: se "corta" la máscara por los bordes oscuros locales
    # (el marco negro de la placa), útil cuando el ruido rompe ese marco.
    v = cv2.GaussianBlur(blurred.max(axis=2).astype(np.float32), (5, 5), 0)
    local_max = cv2.dilate(v, np.ones((7, 7), np.uint8))
    dark = (v < 0.6 * local_max).astype(np.uint8) * 255
    cut = cv2.bitwise_and(mask, cv2.bitwise_not(cv2.dilate(dark, k3)))
    out.extend(_contour_candidates(cut, min_area, max_area, 1))
    timer.lap("contornos_y_filtros")
    return out


def _contour_candidates(mask, min_area, max_area, grow):
    out = []
    contours, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hier is not None:
        for i, c in enumerate(contours):
            if hier[0][i][3] != -1:  # sólo contornos externos (no agujeros)
                continue
            area = cv2.contourArea(c)
            if area < min_area or area > max_area:
                continue
            rect = cv2.minAreaRect(c)
            (rw, rh) = rect[1]
            if min(rw, rh) < 8:
                continue
            aspect = max(rw, rh) / min(rw, rh)
            if not 1.9 <= aspect <= 4.6:
                continue
            rectangularity = area / (rw * rh)
            if rectangularity < 0.72:
                continue
            box = _order_box(rect)
            tilt = np.degrees(np.arctan2(box[1][1] - box[0][1], box[1][0] - box[0][0]))
            if abs(tilt) > 25:
                continue
            if grow:
                box = _expand_box(box, grow, grow)
            out.append((box, area))
    return out


def _read_plate(img: np.ndarray, box: np.ndarray, timer: _Timer):
    long_side = float(np.linalg.norm(box[1] - box[0]))
    short_side = float(np.linalg.norm(box[3] - box[0]))
    out_w = int(round(NORM_H * long_side / short_side))
    plate = _warp(img, box, out_w, NORM_H)
    border = 0.09 * short_side
    full_box = _expand_box(box, border, border)
    crop_h = 96
    crop = _warp(img, _expand_box(full_box, 2, 2), int(round(crop_h * (long_side + 2 * border + 4) /
                                                              (short_side + 2 * border + 4))), crop_h)
    timer.lap("enderezado")

    binary = _binarize(plate)
    chars = _segment(binary)
    timer.lap("binarizacion_segmentacion")
    if len(chars) < 4:  # sin caracteres oscuros: no es una placa (p. ej. carrocería amarilla)
        timer.lap("ocr_plantillas")
        return None

    results, raws = [], []
    if len(chars) == 6:
        for k, (_, _, _, _, m) in enumerate(chars):
            ch, conf, raw = _classify(m, LETTERS if k < 3 else DIGITS)
            results.append(CharResult(ch, round(conf, 4)))
            raws.append(raw)
    else:
        for _, _, _, _, m in chars:
            ch, conf, raw = _classify(m, ALPHABET)
            results.append(CharResult(ch, round(conf, 4)))
    timer.lap("ocr_plantillas")

    s = "".join(c.char for c in results)
    text = f"{s[:3]}-{s[3:]}" if len(s) == 6 else s
    valid = bool(PLATE_RE.match(text))
    conf = float(np.mean([c.confidence for c in results])) if results else 0.0
    if not valid:
        conf *= 0.6
    timer.lap("validacion")
    return text, conf, results, valid, crop, full_box


def _iou(a, b) -> float:
    ax0, ay0, aw, ah = a
    bx0, by0, bw, bh = b
    ix = max(0, min(ax0 + aw, bx0 + bw) - max(ax0, bx0))
    iy = max(0, min(ay0 + ah, by0 + bh) - max(ay0, by0))
    inter = ix * iy
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def annotate(img: np.ndarray, plates: list[PlateResult]) -> np.ndarray:
    out = img.copy()
    H, W = out.shape[:2]
    scale = max(0.5, min(1.2, W / 1400))
    for p in plates:
        x, y, w, h = p.bbox
        color = (60, 220, 60) if p.valid_format else (0, 200, 255)
        cv2.polylines(out, [p.polygon.astype(np.int32)], True, color, 1, cv2.LINE_AA)
        cv2.rectangle(out, (x, y), (x + w, y + h), color, 2)
        label = f"{p.text} {p.confidence * 100:.0f}%"
        (tw, th), base = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, scale, 2)
        ly = y - 6 if y - th - 10 >= 0 else y + h + th + 8
        cv2.rectangle(out, (x, ly - th - 5), (x + tw + 8, ly + base), color, -1)
        cv2.putText(out, label, (x + 4, ly - 2), cv2.FONT_HERSHEY_SIMPLEX, scale, (10, 10, 10), 2, cv2.LINE_AA)
    return out


def detect(img: np.ndarray) -> DetectionResult:
    """Detecta y lee las placas de una imagen BGR."""
    get_templates()  # asegura plantillas en caché (no cuenta en la latencia tras el arranque)
    t_start = time.perf_counter()
    timer = _Timer()
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    elif img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    H, W = img.shape[:2]

    plates: list[PlateResult] = []
    for box, _area in _candidates(img, timer):
        bx = cv2.boundingRect(box.astype(np.int32))
        if any(p.valid_format and _iou(bx, p.bbox) > 0.5 for p in plates):
            continue  # ya leída desde otra variante de máscara
        r = _read_plate(img, box, timer)
        if r is None:
            continue
        text, conf, chars, valid, crop, full_box = r
        x0, y0 = np.floor(full_box.min(axis=0)).astype(int)
        x1, y1 = np.ceil(full_box.max(axis=0)).astype(int)
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
        plates.append(PlateResult(text=text, confidence=round(conf, 4),
                                  bbox=[int(x0), int(y0), int(x1 - x0), int(y1 - y0)],
                                  chars=chars, valid_format=valid, crop=crop, polygon=full_box))
    # Supresión de duplicados.
    plates.sort(key=lambda p: (p.valid_format, p.confidence), reverse=True)
    kept: list[PlateResult] = []
    for p in plates:
        if all(_iou(p.bbox, k.bbox) < 0.3 for k in kept):
            kept.append(p)
    kept.sort(key=lambda p: (p.bbox[0], p.bbox[1]))
    timer.lap("validacion")

    annotated = annotate(img, kept)
    timer.lap("anotacion")
    order = ["preprocesado", "mascara_amarilla", "contornos_y_filtros", "enderezado",
             "binarizacion_segmentacion", "ocr_plantillas", "validacion", "anotacion"]
    stages = [{"name": n, "ms": round(timer.stages.get(n, 0.0), 3)} for n in order]
    total = (time.perf_counter() - t_start) * 1000.0
    return DetectionResult(plates=kept, annotated=annotated, stages=stages,
                           processing_ms=round(total, 3), width=W, height=H)
