"""Convierte el dataset de Hugging Face (parquet) al formato YOLO para entrenar el detector.

Fuente: sonnetechnology/license-plate-text-recognition-full (CC BY 4.0), derivado de
keremberke/license-plate-object-detection (Roboflow, fotos de Open Images).
Cada fila trae la imagen, los recuadros de las placas en formato [x1, y1, x2, y2] (esquinas, en píxeles;
verificado sobre los datos, aunque la ficha del dataset original dice COCO)
y el texto de cada placa (este último se usa en prepare_ocr.py).

Por ser un proyecto de clase se usa una muestra fija de 1000 fotos (700/150/150).
La lista de fotos elegidas se guarda en ml/datasets/subset.json para que el lector
(prepare_ocr.py) use exactamente las mismas.

Uso:  python ml/prepare_detection.py [--train 700 --val 150 --test 150]
Salida: ml/datasets/det/{images,labels}/{train,val,test} + data.yaml + subset.json
"""
from __future__ import annotations

import argparse
import io
import json
import random
import shutil
from pathlib import Path

import pyarrow.parquet as pq
from PIL import Image

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "datasets" / "raw"
OUT = ROOT / "datasets" / "det"
SPLITS = {"train": "train.parquet", "val": "validation.parquet", "test": "test.parquet"}


def convert_split(name: str, parquet: Path, limit: int, seed: int) -> tuple[int, int, list[int]]:
    rows = pq.read_table(parquet).to_pylist()
    rows = [r for r in rows if r["bbox"]]  # solo fotos con al menos una placa
    if len(rows) > limit:
        rows = random.Random(seed).sample(rows, limit)
    img_dir = OUT / "images" / name
    lbl_dir = OUT / "labels" / name
    img_dir.mkdir(parents=True, exist_ok=True)
    lbl_dir.mkdir(parents=True, exist_ok=True)
    n_boxes = 0
    for r in rows:
        im = Image.open(io.BytesIO(r["image"]["bytes"])).convert("RGB")
        w, h = im.size
        lines = []
        for bx0, by0, bx1, by1 in r["bbox"]:
            # esquinas en píxeles -> YOLO (centro + tamaño normalizados)
            x0, y0 = max(0.0, bx0), max(0.0, by0)
            x1, y1 = min(float(w), bx1), min(float(h), by1)
            if x1 - x0 < 2 or y1 - y0 < 2:
                continue
            cx, cy = (x0 + x1) / 2 / w, (y0 + y1) / 2 / h
            lines.append(f"0 {cx:.6f} {cy:.6f} {(x1 - x0) / w:.6f} {(y1 - y0) / h:.6f}")
        stem = f"{name}_{r['image_id']}"
        im.save(img_dir / f"{stem}.jpg", quality=92)
        (lbl_dir / f"{stem}.txt").write_text("\n".join(lines), encoding="utf-8")
        n_boxes += len(lines)
    return len(rows), n_boxes, [int(r["image_id"]) for r in rows]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", type=int, default=700)
    ap.add_argument("--val", type=int, default=150)
    ap.add_argument("--test", type=int, default=150)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    if OUT.exists():
        shutil.rmtree(OUT)
    limits = {"train": args.train, "val": args.val, "test": args.test}
    subset = {}
    for name, file in SPLITS.items():
        n_img, n_box, ids = convert_split(name, RAW / file, limits[name], args.seed)
        subset[name] = ids
        print(f"{name:5s}: {n_img} imágenes, {n_box} placas")
    (ROOT / "datasets" / "subset.json").write_text(json.dumps(subset), encoding="utf-8")
    (OUT / "data.yaml").write_text(
        f"path: {OUT.as_posix()}\ntrain: images/train\nval: images/val\ntest: images/test\n"
        "names:\n  0: placa\n",
        encoding="utf-8",
    )
    print("data.yaml listo en", OUT)


if __name__ == "__main__":
    main()
