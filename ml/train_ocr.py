"""Entrena el lector de placas (CRNN + CTC) desde cero en CPU.

Uso:  python ml/train_ocr.py [--epochs 20] [--threads 6]
Salidas:
  backend/models/ocr_crnn.pt          pesos + metadatos (lo usa la API)
  ml/runs/ocr/history.json            métricas por época (curvas)
  ml/runs/ocr/metrics.json            métricas finales en test
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent))
from keep_awake import keep_awake  # noqa: E402

import numpy as np
import torch
from torch import nn
from torch.utils.data import ConcatDataset, DataLoader, Dataset

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
sys.path.insert(0, str(PROJECT))
from backend.app.ml_models import CRNN, IMG_H, IMG_W, encode, greedy_decode, preprocess  # noqa: E402

DATA = ROOT / "datasets" / "ocr"
RUNS = ROOT / "runs" / "ocr"
MODEL_OUT = PROJECT / "backend" / "models" / "ocr_crnn.pt"


def levenshtein(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


class PlateCrops(Dataset):
    def __init__(self, npz: Path, train: bool):
        d = np.load(npz)
        self.x, self.y, self.train = d["x"], [str(t) for t in d["y"]], train

    def __len__(self):
        return len(self.y)

    def __getitem__(self, i):
        import cv2

        img = self.x[i]
        if self.train:
            h, w = img.shape
            # recorte suave: como mucho 5 % del ancho para no eliminar caracteres (la etiqueta los incluye)
            ch, cw = random.randint(int(h * 0.88), h), random.randint(int(w * 0.95), w)
            y0, x0 = random.randint(0, h - ch), random.randint(0, w - cw)
            img = img[y0:y0 + ch, x0:x0 + cw].astype(np.float32)
            img = img * random.uniform(0.6, 1.4) + random.uniform(-35, 35)
            if random.random() < 0.3:
                img = cv2.GaussianBlur(img, (3, 3), random.uniform(0.3, 1.2))
            img += np.random.normal(0, random.uniform(0, 10), img.shape)
            if random.random() < 0.15:
                angle = random.uniform(-4, 4)
                m = cv2.getRotationMatrix2D((img.shape[1] / 2, img.shape[0] / 2), angle, 1.0)
                img = cv2.warpAffine(img, m, (img.shape[1], img.shape[0]), borderMode=cv2.BORDER_REPLICATE)
            img = np.clip(img, 0, 255).astype(np.uint8)
        return preprocess(img), self.y[i]


def collate(batch):
    xs, ys = zip(*batch)
    targets = [torch.tensor(encode(y), dtype=torch.long) for y in ys]
    return torch.stack(xs), torch.cat(targets), torch.tensor([len(t) for t in targets]), list(ys)


@torch.no_grad()
def evaluate(model, loader) -> dict:
    model.eval()
    n = exact = edits = chars = 0
    conf_sum = 0.0
    examples = []
    for x, _, _, ys in loader:
        for (pred, confs), gt in zip(greedy_decode(model(x)), ys):
            n += 1
            exact += pred == gt
            edits += levenshtein(pred, gt)
            chars += len(gt)
            conf_sum += float(np.prod(confs)) if confs else 0.0
            if pred != gt and len(examples) < 12:
                examples.append({"esperado": gt, "predicho": pred})
    return {"n": n, "plate_accuracy": exact / max(n, 1), "cer": edits / max(chars, 1),
            "char_accuracy": max(0.0, 1 - edits / max(chars, 1)), "avg_confidence": conf_sum / max(n, 1),
            "errores_ejemplo": examples}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=1.5e-3)
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    keep_awake()  # que Windows no se suspenda a mitad del entrenamiento
    torch.manual_seed(args.seed)
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.set_num_threads(args.threads)
    RUNS.mkdir(parents=True, exist_ok=True)
    MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)

    train_ds = ConcatDataset([PlateCrops(DATA / "real_train.npz", True), PlateCrops(DATA / "synth_train.npz", True)])
    evals = {k: DataLoader(PlateCrops(DATA / f"{k}.npz", False), batch_size=256, collate_fn=collate)
             for k in ("real_val", "synth_val")}
    # num_workers=0: en Windows cada worker es otro proceso Python completo (mucha RAM)
    loader = DataLoader(train_ds, batch_size=args.batch, shuffle=True, collate_fn=collate, num_workers=0)

    model = CRNN()
    n_params = sum(p.numel() for p in model.parameters())
    print(f"CRNN: {n_params / 1e6:.2f} M parámetros | entrenamiento: {len(train_ds)} recortes", flush=True)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=args.epochs * len(loader),
                                                pct_start=0.15)
    ctc = nn.CTCLoss(blank=0, zero_infinity=True)

    history, best_score, t_start = [], -1.0, time.time()
    for epoch in range(1, args.epochs + 1):
        model.train()
        t0, loss_sum, steps = time.time(), 0.0, 0
        for x, targets, lengths, _ in loader:
            logits = model(x)                                   # (B, T, C)
            log_probs = logits.log_softmax(-1).permute(1, 0, 2)  # (T, B, C) para CTC
            in_len = torch.full((x.size(0),), log_probs.size(0), dtype=torch.long)
            loss = ctc(log_probs, targets, in_len, lengths)
            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step()
            sched.step()
            loss_sum += loss.item()
            steps += 1
        m = {k: evaluate(model, dl) for k, dl in evals.items()}
        row = {"epoch": epoch, "train_loss": loss_sum / steps, "seconds": time.time() - t0,
               **{f"{k}_{mk}": m[k][mk] for k in m for mk in ("plate_accuracy", "char_accuracy")}}
        history.append(row)
        # el objetivo son placas colombianas: se prioriza el conjunto sintético colombiano
        score = 0.6 * m["synth_val"]["plate_accuracy"] + 0.4 * m["real_val"]["plate_accuracy"]
        mark = ""
        if score > best_score:
            best_score, mark = score, "  <- mejor"
            torch.save({"state_dict": model.state_dict(), "img_h": IMG_H, "img_w": IMG_W,
                        "epoch": epoch, "arch": "CRNN"}, MODEL_OUT)
        print(f"época {epoch:2d} | pérdida {row['train_loss']:.3f} | "
              f"real val {m['real_val']['plate_accuracy']:.1%} (car {m['real_val']['char_accuracy']:.1%}) | "
              f"sint. val {m['synth_val']['plate_accuracy']:.1%} | {row['seconds']:.0f}s{mark}", flush=True)
        (RUNS / "history.json").write_text(json.dumps(history, indent=1), encoding="utf-8")

    # evaluación final con el mejor modelo sobre conjuntos de prueba nunca vistos
    ckpt = torch.load(MODEL_OUT, map_location="cpu")
    model.load_state_dict(ckpt["state_dict"])
    tests = {k: evaluate(model, DataLoader(PlateCrops(DATA / f"{k}.npz", False), batch_size=256, collate_fn=collate))
             for k in ("real_test", "synth_test")}
    metrics = {"model": "CRNN (CNN + BiLSTM + CTC)", "params": n_params, "best_epoch": ckpt["epoch"],
               "epochs": args.epochs, "train_samples": len(train_ds),
               "train_minutes": (time.time() - t_start) / 60, "test": tests}
    (RUNS / "metrics.json").write_text(json.dumps(metrics, indent=1, ensure_ascii=False), encoding="utf-8")
    for k, v in tests.items():
        print(f"TEST {k}: placas exactas {v['plate_accuracy']:.1%} | caracteres {v['char_accuracy']:.1%} | n={v['n']}")


if __name__ == "__main__":
    main()
