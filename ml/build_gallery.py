"""Arma la galería de FOTOS REALES que usa la app (backend/gallery/).

Fuentes (ya descargadas en ml/datasets por los scripts de preparación):
  * dataset: las 150 fotos de PRUEBA de sonnetechnology/license-plate-text-recognition-full
    (CC BY 4.0). El modelo nunca las vio al entrenar. Traen la caja de cada placa y su texto;
    el texto lo generó otro modelo (TrOCR), así que se guarda solo si parece una placa
    (4-10 caracteres alfanuméricos con al menos un dígito); si no, queda en null.
  * colombia: las 18 fotos de placas colombianas etiquetadas a mano (ml/datasets/colombia_real).
    No tienen licencia declarada: se copian solo para uso local y backend/gallery/colombia/
    está ignorada por git. Traen el texto pero no la caja.

Uso:  python ml/build_gallery.py
Salida: backend/gallery/{dataset,colombia}/*.jpg + backend/gallery/catalog.json
"""
from __future__ import annotations

import io
import json
import re
import shutil
from pathlib import Path

import pyarrow.parquet as pq
from PIL import Image

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
DATASETS = ROOT / "datasets"
OUT = PROJECT / "backend" / "gallery"

DATASET_INFO = {
    "nombre": "sonnetechnology/license-plate-text-recognition-full",
    "url": "https://huggingface.co/datasets/sonnetechnology/license-plate-text-recognition-full",
    "licencia": "CC BY 4.0",
    "descripcion": "Fotos reales de vehículos (Open Images) de varios países. Partición de prueba: el modelo nunca las vio al entrenar.",
    "nota": "El texto esperado lo generó otro modelo (TrOCR), no personas: puede tener errores.",
}
COLOMBIA_INFO = {
    "nombre": "Placas colombianas (Alefig12/colombian-license-plate-recognizer)",
    "url": "https://github.com/Alefig12/colombian-license-plate-recognizer",
    "licencia": "Sin licencia declarada: solo uso local, no se redistribuye",
    "descripcion": "Fotos reales de carros colombianos con el texto de la placa anotado a mano.",
    "nota": "Solo se conoce el texto de la placa, no su posición en la foto.",
}


def normalize_label(s: str) -> str | None:
    t = re.sub(r"[^A-Z0-9]", "", str(s).upper())
    return t if 4 <= len(t) <= 10 and re.search(r"\d", t) else None


def build_dataset() -> list[dict]:
    ids = set(json.loads((DATASETS / "subset.json").read_text(encoding="utf-8"))["test"])
    rows = [r for r in pq.read_table(DATASETS / "raw" / "test.parquet").to_pylist() if int(r["image_id"]) in ids]
    out_dir = OUT / "dataset"
    out_dir.mkdir(parents=True, exist_ok=True)
    photos = []
    for r in sorted(rows, key=lambda r: int(r["image_id"])):
        im = Image.open(io.BytesIO(r["image"]["bytes"])).convert("RGB")
        w, h = im.size
        gts = []
        for (x0, y0, x1, y1), raw in zip(r["bbox"], r["target"]):  # esquinas en píxeles
            x0, y0 = max(0, int(round(x0))), max(0, int(round(y0)))
            x1, y1 = min(w, int(round(x1))), min(h, int(round(y1)))
            if x1 - x0 < 2 or y1 - y0 < 2:
                continue
            gts.append({"text": normalize_label(raw), "bbox": [x0, y0, x1 - x0, y1 - y0]})
        if not gts:
            continue
        pid = f"ds_{int(r['image_id'])}"
        im.save(out_dir / f"{pid}.jpg", quality=92)
        photos.append({"id": pid, "set": "dataset", "file": f"dataset/{pid}.jpg", "width": w, "height": h,
                       "ground_truth": gts})
    return photos


def build_colombia() -> list[dict]:
    src = DATASETS / "colombia_real"
    labels = {k: v for k, v in json.loads((src / "labels.json").read_text(encoding="utf-8")).items()
              if not k.startswith("_")}
    out_dir = OUT / "colombia"
    out_dir.mkdir(parents=True, exist_ok=True)
    photos = []
    for name, text in sorted(labels.items(), key=lambda kv: int(Path(kv[0]).stem)):
        pid = f"co_{Path(name).stem}"
        with Image.open(src / name) as im:
            w, h = im.size
        shutil.copy2(src / name, out_dir / f"{pid}.jpg")
        photos.append({"id": pid, "set": "colombia", "file": f"colombia/{pid}.jpg", "width": w, "height": h,
                       "ground_truth": [{"text": normalize_label(text), "bbox": None}]})
    return photos


def main() -> None:
    for sub in ("dataset", "colombia"):
        shutil.rmtree(OUT / sub, ignore_errors=True)
    photos = build_colombia() + build_dataset()
    catalog = {"sets": {"colombia": COLOMBIA_INFO, "dataset": DATASET_INFO}, "photos": photos}
    (OUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")
    n_ds = sum(p["set"] == "dataset" for p in photos)
    readable = sum(g["text"] is not None for p in photos if p["set"] == "dataset" for g in p["ground_truth"])
    plates = sum(len(p["ground_truth"]) for p in photos if p["set"] == "dataset")
    print(f"Galería: {len(photos) - n_ds} fotos colombianas + {n_ds} del dataset "
          f"({plates} placas, {readable} con texto legible) -> {OUT}")


if __name__ == "__main__":
    main()
