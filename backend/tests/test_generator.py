import re

import numpy as np
import pytest

from backend.app.generator import SCENE_H, SCENE_W, generate_scene

PLATE_RE = re.compile(r"^[A-HJ-NPR-Z]{3}-[0-9]{3}$")


@pytest.mark.parametrize("difficulty", ["easy", "medium", "hard"])
def test_deterministic(difficulty):
    a = generate_scene(123, difficulty)
    b = generate_scene(123, difficulty)
    assert a.ground_truth == b.ground_truth
    assert np.array_equal(np.asarray(a.image), np.asarray(b.image))


def test_different_seeds_differ():
    a = generate_scene(1, "easy")
    b = generate_scene(2, "easy")
    assert not np.array_equal(np.asarray(a.image), np.asarray(b.image))


@pytest.mark.parametrize("seed", range(20))
def test_ground_truth_format(seed):
    diff = ["easy", "medium", "hard"][seed % 3]
    s = generate_scene(seed, diff)
    assert s.image.size == (SCENE_W, SCENE_H)
    assert s.image.mode == "RGB"
    assert 1 <= len(s.plates) <= 3
    texts = [p.text for p in s.plates]
    assert len(set(texts)) == len(texts)
    for p in s.plates:
        assert PLATE_RE.match(p.text), p.text
        x, y, w, h = p.bbox
        assert x >= 0 and y >= 0 and x + w <= SCENE_W and y + h <= SCENE_H
        assert 1.8 <= w / h <= 3.6
    # Las placas no se solapan entre sí (vehículos sin solapamiento).
    for i, a in enumerate(s.plates):
        for b in s.plates[i + 1:]:
            ax, ay, aw, ah = a.bbox
            bx, by, bw, bh = b.bbox
            assert ax + aw <= bx or bx + bw <= ax or ay + ah <= by or by + bh <= ay


def test_vehicle_count_parameter():
    for n in (1, 2, 3):
        assert len(generate_scene(7, "medium", n_vehicles=n).plates) == n


def test_invalid_difficulty():
    with pytest.raises(ValueError):
        generate_scene(1, "extreme")


def test_random_seed_when_none():
    s = generate_scene(None, "easy")
    assert isinstance(s.seed, int)
