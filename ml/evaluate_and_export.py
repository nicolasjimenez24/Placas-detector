"""Evalúa el sistema completo con fotos colombianas reales y exporta la ficha del modelo.

1. Corre detector + lector entrenados sobre ml/datasets/colombia_real (18 fotos etiquetadas
   a mano, nunca usadas al entrenar).
2. Reúne métricas de entrenamiento y prueba en backend/models/model_card.json, que la app
   muestra en la vista "Modelo".

Uso:  python ml/evaluate_and_export.py
"""
from __future__ import annotations

import csv
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
sys.path.insert(0, str(PROJECT))
from backend.app import ml_inference  # noqa: E402
from train_ocr import levenshtein  # noqa: E402

COL = ROOT / "datasets" / "colombia_real"
RUNS = ROOT / "runs"
CARD = PROJECT / "backend" / "models" / "model_card.json"
MAX_SIDE = 2000


def load(path: Path):
    img = cv2.imread(str(path))
    h, w = img.shape[:2]
    if max(h, w) > MAX_SIDE:
        f = MAX_SIDE / max(h, w)
        img = cv2.resize(img, (int(w * f), int(h * f)), interpolation=cv2.INTER_AREA)
    return img


def score(texts: list[str], gt: str) -> tuple[bool, float, str]:
    """Mejor placa leída frente a la esperada: (exacta, precisión de caracteres, texto)."""
    if not texts:
        return False, 0.0, ""
    best = min(texts, key=lambda t: levenshtein(t, gt))
    return best == gt, max(0.0, 1 - levenshtein(best, gt) / len(gt)), best


def evaluate_colombia() -> dict:
    labels = {k: v for k, v in json.loads((COL / "labels.json").read_text(encoding="utf-8")).items()
              if not k.startswith("_")}
    rows, agg = [], {"ml": [0, 0, 0.0, 0.0]}  # detectadas, exactas, car, ms
    for name, gt in labels.items():
        img = load(COL / name)
        row = {"imagen": name, "esperado": gt}
        for key, fn in (("ml", ml_inference.detect),):
            t0 = time.perf_counter()
            res = fn(img)
            ms = (time.perf_counter() - t0) * 1000
            texts = [p.text.replace("-", "") for p in res.plates]
            exact, char_acc, best = score(texts, gt)
            a = agg[key]
            a[0] += bool(res.plates)
            a[1] += exact
            a[2] += char_acc
            a[3] += ms
            row[key] = {"leido": best, "exacta": exact, "placas": len(res.plates), "ms": round(ms, 1)}
        rows.append(row)
        print(f"{name:7s} {gt}  leído: {row['ml']['leido'] or '-':8s} {'OK' if row['ml']['exacta'] else ''}")
    n = len(labels)
    summary = {k: {"images": n, "detection_rate": a[0] / n, "plate_accuracy": a[1] / n,
                   "char_accuracy": a[2] / n, "avg_ms": a[3] / n} for k, a in agg.items()}
    return {"summary": summary, "per_image": rows,
            "nota": "18 fotos reales de placas colombianas (sin licencia declarada; no se redistribuyen)."}


def detector_history() -> list[dict]:
    path = RUNS / "detector" / "results.csv"
    if not path.is_file():
        return []
    out = []
    with path.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            r = {k.strip(): v for k, v in r.items()}
            out.append({"epoch": int(float(r["epoch"])),
                        "train_box_loss": float(r["train/box_loss"]), "val_box_loss": float(r["val/box_loss"]),
                        "precision": float(r["metrics/precision(B)"]), "recall": float(r["metrics/recall(B)"]),
                        "map50": float(r["metrics/mAP50(B)"]), "map50_95": float(r["metrics/mAP50-95(B)"])})
    return out


def main() -> None:
    ml_inference.warmup()
    colombia = evaluate_colombia()
    (RUNS / "colombia_eval.json").write_text(json.dumps(colombia, indent=1, ensure_ascii=False), encoding="utf-8")
    det = json.loads((RUNS / "detector" / "metrics.json").read_text(encoding="utf-8"))
    ocr = json.loads((RUNS / "ocr" / "metrics.json").read_text(encoding="utf-8"))
    ocr_hist = json.loads((RUNS / "ocr" / "history.json").read_text(encoding="utf-8"))
    subset = json.loads((ROOT / "datasets" / "subset.json").read_text(encoding="utf-8"))
    card = {
        "version": "1.0",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "dataset": {
            "nombre": "sonnetechnology/license-plate-text-recognition-full (derivado de keremberke/license-plate-object-detection)",
            "url": "https://huggingface.co/datasets/sonnetechnology/license-plate-text-recognition-full",
            "licencia": "CC BY 4.0",
            "imagenes": {k: len(v) for k, v in subset.items()},
            "nota_etiquetas": "El texto de las placas lo generó un modelo (TrOCR), no personas: tiene errores, "
                              "por lo que la precisión de lectura medida en ese conjunto es una cota inferior.",
            "sinteticas_colombianas": {k: int(len(np.load(ROOT / "datasets" / "ocr" / f"synth_{k}.npz")["y"]))
                                       for k in ("train", "val", "test")},
        },
        "detector": {**det, "history": detector_history()},
        "ocr": {**ocr, "history": ocr_hist},
        "colombia_real": colombia,
    }
    CARD.write_text(json.dumps(card, indent=1, ensure_ascii=False), encoding="utf-8")
    print("Ficha del modelo ->", CARD)
    for k, s in colombia["summary"].items():
        print(f"{k:8s}: detección {s['detection_rate']:.0%} | placas exactas {s['plate_accuracy']:.0%} | "
              f"caracteres {s['char_accuracy']:.0%} | {s['avg_ms']:.0f} ms")


if __name__ == "__main__":
    main()
