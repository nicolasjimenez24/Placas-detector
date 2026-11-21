"""Modelo de lectura de placas (CRNN + CTC), compartido por el entrenamiento y la API.

Arquitectura clásica para leer texto en una línea:
  CNN (extrae rasgos visuales) -> la imagen se convierte en una secuencia de columnas ->
  LSTM bidireccional (contexto a izquierda y derecha) -> una distribución de caracteres
  por columna -> decodificación CTC (une repetidos y quita los "blancos").
Con CTC no hace falta segmentar los caracteres ni saber dónde está cada uno.
"""
from __future__ import annotations

import numpy as np
import torch
from torch import nn

ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
BLANK = 0  # índice reservado para el "blanco" de CTC; los caracteres van de 1..36
IMG_H, IMG_W = 32, 128
CHAR2IDX = {c: i + 1 for i, c in enumerate(ALPHABET)}


def encode(text: str) -> list[int]:
    return [CHAR2IDX[c] for c in text if c in CHAR2IDX]


def preprocess(img_bgr_or_rgb: np.ndarray) -> torch.Tensor:
    """Recorte de placa (H, W, 3 uint8) -> tensor (1, IMG_H, IMG_W) en [-1, 1], escala de grises."""
    import cv2

    img = img_bgr_or_rgb
    if img.ndim == 3:
        img = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    img = cv2.resize(img, (IMG_W, IMG_H), interpolation=cv2.INTER_AREA)
    # normalización por imagen: robusta a placas muy claras u oscuras
    img = img.astype(np.float32)
    lo, hi = np.percentile(img, 2), np.percentile(img, 98)
    img = np.clip((img - lo) / max(hi - lo, 1.0), 0, 1)
    return torch.from_numpy(img * 2 - 1)[None]


def _block(cin, cout, pool):
    layers = [nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True)]
    if pool:
        layers.append(nn.MaxPool2d(pool))
    return layers


class CRNN(nn.Module):
    def __init__(self, n_classes: int = len(ALPHABET) + 1, hidden: int = 128):
        super().__init__()
        # CNN ligera (pensada para entrenar en CPU): la primera convolución ya reduce a la mitad
        self.cnn = nn.Sequential(
            nn.Conv2d(1, 32, 3, stride=2, padding=1, bias=False), nn.BatchNorm2d(32), nn.ReLU(inplace=True),  # 16 x 64
            *_block(32, 64, (2, 2)),     # 8 x 32
            *_block(64, 96, None),
            *_block(96, 96, (2, 1)),     # 4 x 32
            *_block(96, 128, (2, 1)),    # 2 x 32  -> 32 columnas = 32 pasos de tiempo
            nn.Dropout2d(0.1),
        )
        self.rnn = nn.LSTM(128 * 2, hidden, num_layers=1, bidirectional=True, batch_first=True)
        self.fc = nn.Linear(hidden * 2, n_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        f = self.cnn(x)                       # (B, C, 2, T)
        b, c, h, t = f.shape
        f = f.permute(0, 3, 1, 2).reshape(b, t, c * h)  # (B, T, C*H)
        f, _ = self.rnn(f)
        return self.fc(f)                     # (B, T, n_classes) logits


def greedy_decode(logits: torch.Tensor) -> list[tuple[str, list[float]]]:
    """Decodificación CTC voraz. Devuelve (texto, confianza por carácter) por cada elemento."""
    probs = logits.softmax(-1)
    best_p, best_i = probs.max(-1)
    out = []
    for p_row, i_row in zip(best_p.tolist(), best_i.tolist()):
        text, confs, prev = [], [], BLANK
        for p, i in zip(p_row, i_row):
            if i != BLANK and i != prev:
                text.append(ALPHABET[i - 1])
                confs.append(p)
            elif i != BLANK and i == prev and confs:
                confs[-1] = max(confs[-1], p)
            prev = i
        out.append(("".join(text), confs))
    return out
