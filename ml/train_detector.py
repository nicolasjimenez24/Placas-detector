"""Entrena el detector de placas (YOLO11n preentrenado en COCO, ajustado a placas) en CPU.

Uso:  python ml/train_detector.py [--epochs 15] [--imgsz 416]
Salidas:
  backend/models/plate_detector.pt   pesos finales (los usa la API)
  ml/runs/detector/                  curvas y gráficos de Ultralytics (results.csv, PR, matriz...)
  ml/runs/detector/metrics.json      métricas en el conjunto de prueba (nunca usado al entrenar)
"""
from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent))
from keep_awake import keep_awake  # noqa: E402

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
DATA = ROOT / "datasets" / "det" / "data.yaml"
RUNS = ROOT / "runs"
MODEL_OUT = PROJECT / "backend" / "models" / "plate_detector.pt"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--imgsz", type=int, default=416)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--base", default="yolo11n.pt")
    args = ap.parse_args()

    keep_awake()  # que Windows no se suspenda a mitad del entrenamiento
    t0 = time.time()
    model = YOLO(args.base)
    model.train(data=str(DATA), epochs=args.epochs, imgsz=args.imgsz, batch=args.batch, device="cpu",
                workers=args.workers, project=str(RUNS), name="detector", exist_ok=True, patience=8,
                seed=0, plots=True, verbose=False)
    best = RUNS / "detector" / "weights" / "best.pt"
    MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(best, MODEL_OUT)

    trained = YOLO(str(MODEL_OUT))
    res = trained.val(data=str(DATA), split="test", imgsz=args.imgsz, batch=args.batch, device="cpu",
                      project=str(RUNS), name="detector_test", exist_ok=True, plots=True, verbose=False)
    metrics = {
        "model": f"YOLO11n ajustado ({args.base})",
        "epochs": args.epochs, "imgsz": args.imgsz,
        "train_minutes": (time.time() - t0) / 60,
        "test": {
            "precision": float(res.box.mp), "recall": float(res.box.mr),
            "map50": float(res.box.map50), "map50_95": float(res.box.map),
            "images": int(res.seen) if hasattr(res, "seen") else None,
        },
        "speed_ms_per_image": {k: float(v) for k, v in res.speed.items()},
    }
    (RUNS / "detector" / "metrics.json").write_text(json.dumps(metrics, indent=1), encoding="utf-8")
    print(json.dumps(metrics, indent=1))


if __name__ == "__main__":
    main()
