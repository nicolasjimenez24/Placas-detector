"""Prepara los datos del lector (OCR): recortes de placas + texto.

Fuentes:
  * Real (fotos de varios países): recortes de las placas del dataset de Hugging Face.
    OJO: su texto lo generó otro modelo (TrOCR), no personas; por eso se filtran las
    etiquetas que no tienen forma de placa. El ruido restante limita la precisión medible.
  * Sintético colombiano: placas amarillas ABC123 generadas con synth_colombia.py.

Usa las mismas 1000 fotos que el detector (ml/datasets/subset.json).

Uso:  python ml/prepare_ocr.py [--synth-train 10000]
Salida: ml/datasets/ocr/{real,synth}_{train,val,test}.npz  (imágenes gris STORE_H x STORE_W + textos)
"""
from __future__ import annotations

import argparse
import io
import json
import random
import re
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
from PIL import Image

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
RAW = ROOT / "datasets" / "raw"
OUT = ROOT / "datasets" / "ocr"
STORE_H, STORE_W = 40, 144  # algo más grande que la entrada (32x128) para recortes aleatorios
SPLITS = {"train": "train.parquet", "val": "validation.parquet", "test": "test.parquet"}


def normalize_label(s: str) -> str | None:
    t = re.sub(r"[^A-Z0-9]", "", s.upper())
    if not (4 <= len(t) <= 10) or not re.search(r"\d", t):
        return None
    return t


def to_store(im: Image.Image) -> np.ndarray:
    return np.asarray(im.convert("L").resize((STORE_W, STORE_H), Image.Resampling.BILINEAR), dtype=np.uint8)


def real_split(file: Path, ids: set[int], seed: int) -> tuple[np.ndarray, list[str], int]:
    rng = random.Random(seed)
    rows = [r for r in pq.read_table(file).to_pylist() if int(r["image_id"]) in ids]
    imgs, texts, dropped = [], [], 0
    for r in rows:
        im = None
        for (x, y, x2, y2), raw in zip(r["bbox"], r["target"]):  # esquinas [x1, y1, x2, y2]
            w, h = x2 - x, y2 - y
            label = normalize_label(raw or "")
            # placas de dos renglones (motos): el lector es de una línea y sus etiquetas suelen estar mal
            if label is None or w < 12 or h < 6 or w / h < 2.0:
                dropped += 1
                continue
            if im is None:
                im = Image.open(io.BytesIO(r["image"]["bytes"])).convert("RGB")
            mx, my = w * rng.uniform(0.03, 0.12), h * rng.uniform(0.05, 0.2)
            crop = im.crop((max(0, x - mx), max(0, y - my), min(im.width, x + w + mx), min(im.height, y + h + my)))
            imgs.append(to_store(crop))
            texts.append(label)
    return np.stack(imgs), texts, dropped


def _synth_chunk(args: tuple[int, int]) -> tuple[np.ndarray, list[str]]:
    from synth_colombia import make_sample

    seed, n = args
    rng = random.Random(seed)
    imgs, texts = [], []
    for _ in range(n):
        im, t = make_sample(rng)
        imgs.append(to_store(im))
        texts.append(t)
    return np.stack(imgs), texts


def synth_split(n: int, seed: int, workers: int) -> tuple[np.ndarray, list[str]]:
    chunk = 500
    jobs = [(seed * 100_000 + k, min(chunk, n - k * chunk)) for k in range((n + chunk - 1) // chunk)]
    with ProcessPoolExecutor(workers) as ex:
        parts = list(ex.map(_synth_chunk, jobs))
    return np.concatenate([p[0] for p in parts]), [t for p in parts for t in p[1]]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--synth-train", type=int, default=10000)
    ap.add_argument("--synth-eval", type=int, default=1000)
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    subset = json.loads((ROOT / "datasets" / "subset.json").read_text(encoding="utf-8"))
    for k, (name, file) in enumerate(SPLITS.items()):
        x, y, dropped = real_split(RAW / file, set(subset[name]), seed=k)
        np.savez_compressed(OUT / f"real_{name}.npz", x=x, y=np.array(y))
        print(f"real  {name:5s}: {len(y)} recortes (descartadas {dropped} etiquetas sin forma de placa)")

    for k, (name, n) in enumerate({"train": args.synth_train, "val": args.synth_eval, "test": args.synth_eval}.items()):
        x, y = synth_split(n, seed=k + 1, workers=args.workers)
        np.savez_compressed(OUT / f"synth_{name}.npz", x=x, y=np.array(y))
        print(f"synth {name:5s}: {len(y)} recortes")


if __name__ == "__main__":
    main()
