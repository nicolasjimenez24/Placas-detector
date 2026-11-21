import random
import re

import cv2
import numpy as np
import pytest

from backend.app import detector
from backend.app.generator import draw_background, generate_scene

N_PER_DIFFICULTY = 25
TARGETS = {"easy": 0.95, "medium": 0.90, "hard": 0.75}


def _bgr(pil_img):
    return cv2.cvtColor(np.asarray(pil_img), cv2.COLOR_RGB2BGR)


def _evaluate(difficulty, n, start):
    expected = exact = fp = 0
    times = []
    for seed in range(start, start + n):
        s = generate_scene(seed, difficulty)
        r = detector.detect(_bgr(s.image))
        times.append(r.processing_ms)
        used = set()
        for g in s.plates:
            expected += 1
            best = max(((detector._iou(g.bbox, p.bbox), j) for j, p in enumerate(r.plates)
                        if j not in used), default=(0.0, -1))
            if best[0] >= 0.3:
                used.add(best[1])
                exact += r.plates[best[1]].text == g.text
        fp += len(r.plates) - len(used)
    return exact / expected, fp, float(np.mean(times))


@pytest.mark.parametrize("difficulty", ["easy", "medium", "hard"])
def test_accuracy_targets(difficulty):
    acc, fp, mean_ms = _evaluate(difficulty, N_PER_DIFFICULTY, 9000)
    assert acc >= TARGETS[difficulty], f"{difficulty}: precisión {acc:.3f}"
    assert fp <= 1
    assert mean_ms < 500


def test_result_structure():
    s = generate_scene(42, "easy")
    r = detector.detect(_bgr(s.image))
    assert r.width == 960 and r.height == 600
    assert r.annotated.shape == (600, 960, 3)
    names = [st["name"] for st in r.stages]
    assert names == ["preprocesado", "mascara_amarilla", "contornos_y_filtros", "enderezado",
                     "binarizacion_segmentacion", "ocr_plantillas", "validacion", "anotacion"]
    assert all(st["ms"] >= 0 for st in r.stages)
    assert r.plates
    for p in r.plates:
        assert 0 <= p.confidence <= 1
        assert len(p.chars) == 6
        assert all(0 <= c.confidence <= 1 for c in p.chars)
        assert p.valid_format and re.match(r"^[A-HJ-NPR-Z]{3}-\d{3}$", p.text)
        assert p.crop.ndim == 3 and p.crop.shape[0] > 10


def test_no_plates_on_background():
    bg = draw_background(random.Random(3), np.random.default_rng(3), yellow_lines=True)
    assert detector.detect(_bgr(bg)).plates == []


def test_rejects_yellow_blank_rectangles():
    img = np.full((400, 600, 3), 70, np.uint8)
    cv2.rectangle(img, (50, 50), (290, 140), (21, 204, 250), -1)   # aspecto de placa, sin caracteres
    cv2.rectangle(img, (320, 60), (560, 330), (21, 195, 245), -1)  # "carrocería" amarilla
    assert detector.detect(img).plates == []


def test_grayscale_and_bgra_input():
    s = generate_scene(5, "easy")
    bgr = _bgr(s.image)
    assert detector.detect(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)).plates == []  # sin color no hay amarillo
    r = detector.detect(cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA))
    assert {p.text for p in r.plates} == {p.text for p in s.plates}


def test_position_correction_tables():
    assert detector.TO_LETTER["0"] == "D" and detector.TO_DIGIT["B"] == "8"
    assert all(v in detector.LETTERS for v in detector.TO_LETTER.values())
    assert all(v in detector.DIGITS for v in detector.TO_DIGIT.values())
