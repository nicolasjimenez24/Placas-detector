"""Evita que Windows se suspenda mientras corre un entrenamiento largo.

Es una petición del propio proceso (SetThreadExecutionState): no cambia la configuración
de energía y deja de aplicar en cuanto el proceso termina. En otros sistemas no hace nada.
"""
import sys


def keep_awake() -> None:
    if sys.platform == "win32":
        import ctypes

        ES_CONTINUOUS, ES_SYSTEM_REQUIRED = 0x80000000, 0x00000001
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)
