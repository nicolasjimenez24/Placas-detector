"""Evalúa el modelo entrenado sobre TODA la galería de fotos reales y guarda un informe detallado.

Para cada foto corre el pipeline completo (YOLO + CRNN + formato) y lo compara con el valor
esperado usando la misma evaluación que la API. Además del resumen, calcula:
  * métricas por conjunto (colombianas / dataset público),
  * calidad de localización (IoU de cada placa encontrada con su caja esperada),
  * precisión según el tamaño de la placa en la foto,
  * calibración: ¿la confianza del modelo predice si acierta?,
  * confusiones de caracteres más frecuentes y latencia (media, p50, p95).

Uso:  python ml/evaluate_gallery.py
Salida: backend/models/gallery_report.json (la muestra la vista «Pruebas» de la app)
"""
from __future__ import annotations

import json
import statistics
import sys
import time
from collections import Counter
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
sys.path.insert(0, str(PROJECT))
from backend.app import gallery, ml_inference  # noqa: E402
from backend.app.main import char_accuracy, evaluate, match_plates, norm_text  # noqa: E402
from backend.app.results import iou  # noqa: E402

OUT = PROJECT / "backend" / "models" / "gallery_report.json"
SIZE_BUCKETS = [(0, 40, "< 40 px"), (40, 80, "40–80 px"), (80, 140, "80–140 px"), (140, 10**9, "≥ 140 px")]
CONF_BUCKETS = [(0, .4, "< 40 %"), (.4, .55, "40–55 %"), (.55, .7, "55–70 %"), (.7, 1.01, "≥ 70 %")]


def summarize(rows: list[dict]) -> dict:
    ev = [r["evaluation"] for r in rows]
    expected = sum(e["expected"] for e in ev)
    readable = sum(e["readable"] for e in ev)
    return {
        "photos": len(rows),
        "plates_expected": expected,
        "plates_readable": readable,
        "detection_rate": round(sum(e["matched"] for e in ev) / expected, 4) if expected else None,
        "plate_accuracy": round(sum(e["exact_matches"] for e in ev) / readable, 4) if readable else None,
        "char_accuracy": round(sum(e["char_accuracy"] * e["readable"] for e in ev) / readable, 4) if readable else None,
        "false_positives": sum(max(0, len(r["plates"]) - e["matched"]) for r, e in zip(rows, ev)),
        "photos_correct": sum(e["correct"] for e in ev),
        "avg_ms": round(statistics.mean(r["ms"] for r in rows), 1) if rows else None,
    }


def char_confusions(pairs: list[tuple[str, str]]) -> list[dict]:
    """Sustituciones carácter a carácter en lecturas de la misma longitud (esperado -> leído)."""
    c = Counter()
    for gt, pred in pairs:
        if len(gt) == len(pred) and gt != pred:
            c.update((a, b) for a, b in zip(gt, pred) if a != b)
    return [{"esperado": a, "leido": b, "veces": n} for (a, b), n in c.most_common(12)]


def main() -> None:
    if not ml_inference.available():
        sys.exit("Faltan los pesos del modelo (backend/models/*.pt)")
    photos = gallery.list_photos()
    if not photos:
        sys.exit("La galería está vacía: corre antes python ml/build_gallery.py")
    ml_inference.warmup()
    rows, ious, read_pairs, size_rows, conf_rows = [], [], [], [], []
    t_all = time.perf_counter()
    for k, ph in enumerate(photos, 1):
        img = cv2.imdecode(np.fromfile(str(gallery.photo_path(ph)), np.uint8), cv2.IMREAD_COLOR)
        t0 = time.perf_counter()
        res = ml_inference.detect(img)
        ms = (time.perf_counter() - t0) * 1000
        plates = [{"text": p.text, "bbox": [int(v) for v in p.bbox], "confidence": float(p.confidence)} for p in res.plates]
        gts = ph["ground_truth"]
        ev = evaluate(plates, gts)
        pairs = match_plates(plates, gts)
        for gi, pi in pairs:
            g, p = gts[gi], plates[pi]
            if g.get("bbox"):
                ious.append(iou(g["bbox"], p["bbox"]))
            if g.get("text"):
                ok = norm_text(p["text"]) == g["text"]
                read_pairs.append((g["text"], norm_text(p["text"])))
                conf_rows.append((p["confidence"], ok))
        matched_g = {gi for gi, _ in pairs}
        for gi, g in enumerate(gts):
            if g.get("bbox"):
                size_rows.append((g["bbox"][2], gi in matched_g,
                                  bool(g.get("text")) and gi in matched_g and norm_text(plates[dict(pairs)[gi]]["text"]) == g["text"],
                                  bool(g.get("text"))))
        rows.append({"id": ph["id"], "set": ph["set"], "expected": [g["text"] for g in gts],
                     "read": [p["text"] for p in plates], "plates": plates, "evaluation": ev, "ms": round(ms, 1)})
        print(f"[{k:3d}/{len(photos)}] {ph['id']:8s} esperado {[g['text'] for g in gts]}  leído {[p['text'] for p in plates]}"
              f"  {'OK' if ev['correct'] else ''}", flush=True)

    lat = sorted(r["ms"] for r in rows)
    by_size = []
    for lo, hi, label in SIZE_BUCKETS:
        sel = [r for r in size_rows if lo <= r[0] < hi]
        legible = [r for r in sel if r[3]]
        by_size.append({"rango": label, "placas": len(sel),
                        "detection_rate": round(sum(r[1] for r in sel) / len(sel), 4) if sel else None,
                        "plate_accuracy": round(sum(r[2] for r in legible) / len(legible), 4) if legible else None})
    calib = []
    for lo, hi, label in CONF_BUCKETS:
        sel = [ok for c, ok in conf_rows if lo <= c < hi]
        calib.append({"rango": label, "lecturas": len(sel), "aciertos": round(sum(sel) / len(sel), 4) if sel else None})
    report = {
        "version": "1.0",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "total_seconds": round(time.perf_counter() - t_all, 1),
        "summary": summarize(rows),
        "by_set": {s: summarize([r for r in rows if r["set"] == s]) for s in gallery.SETS},
        "localization": {
            "matched": len(ious),
            "iou_mean": round(statistics.mean(ious), 4) if ious else None,
            "iou_ge_50": round(sum(v >= .5 for v in ious) / len(ious), 4) if ious else None,
            "iou_ge_70": round(sum(v >= .7 for v in ious) / len(ious), 4) if ious else None,
            "histogram": [int(sum(k / 10 <= v < (k + 1) / 10 or (k == 9 and v == 1) for v in ious)) for k in range(10)],
        },
        "by_plate_size": by_size,
        "calibration": calib,
        "char_confusions": char_confusions(read_pairs),
        "char_accuracy_hist": [sum(lo <= char_accuracy(g, p) < lo + .2 or (lo >= .8 and char_accuracy(g, p) == 1) for g, p in read_pairs)
                               for lo in (0, .2, .4, .6, .8)],
        "latency_ms": {"mean": round(statistics.mean(lat), 1), "p50": lat[len(lat) // 2], "p95": lat[int(len(lat) * .95) - 1],
                       "min": lat[0], "max": lat[-1]},
        "per_photo": [{k: v for k, v in r.items() if k != "plates"} for r in rows],
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    s = report["summary"]
    print(f"\nInforme -> {OUT}")
    for name, m in [("TOTAL", s), *report["by_set"].items()]:
        print(f"{name:9s} fotos {m['photos']:3d} | detección {m['detection_rate']:.1%} | placas exactas {m['plate_accuracy']:.1%}"
              f" | caracteres {m['char_accuracy']:.1%} | falsos positivos {m['false_positives']} | {m['avg_ms']} ms")


if __name__ == "__main__":
    main()
