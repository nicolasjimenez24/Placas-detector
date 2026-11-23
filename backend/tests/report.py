"""Ejecuta todas las pruebas automatizadas y guarda un resumen que muestra la vista «Pruebas».

Uso (raíz del proyecto):  python -m backend.tests.report
Salida: backend/models/test_report.json
"""
from __future__ import annotations

import ast
import json
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TESTS = ROOT / "backend" / "tests"
OUT = ROOT / "backend" / "models" / "test_report.json"


def describe(path: Path) -> str:
    doc = ast.get_docstring(ast.parse(path.read_text(encoding="utf-8"))) or ""
    return doc.strip().splitlines()[0] if doc.strip() else ""


def test_doc(path: Path) -> dict[str, str]:
    """Docstring (primera línea) de cada función de prueba, si la tiene."""
    out = {}
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.FunctionDef) and node.name.startswith("test_"):
            d = ast.get_docstring(node)
            if d:
                out[node.name] = d.strip().splitlines()[0]
    return out


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        xml_path = Path(tmp) / "junit.xml"
        t0 = time.perf_counter()
        proc = subprocess.run([sys.executable, "-m", "pytest", str(TESTS), "-q", f"--junitxml={xml_path}"],
                              cwd=ROOT, capture_output=True, text=True)
        seconds = time.perf_counter() - t0
        print(proc.stdout[-1500:])
        root = ET.parse(xml_path).getroot()
    files: dict[str, dict] = {}
    for case in root.iter("testcase"):
        mod = case.get("classname", "").rsplit(".", 1)[-1]  # backend.tests.test_api -> test_api
        path = TESTS / f"{mod}.py"
        f = files.setdefault(mod, {"file": f"backend/tests/{mod}.py", "description": describe(path) if path.is_file() else "",
                                   "docs": test_doc(path) if path.is_file() else {}, "tests": []})
        status = "passed"
        if case.find("failure") is not None or case.find("error") is not None:
            status = "failed"
        elif case.find("skipped") is not None:
            status = "skipped"
        name = case.get("name", "")
        f["tests"].append({"name": name, "status": status, "seconds": round(float(case.get("time", 0)), 3),
                           "doc": f["docs"].get(name.split("[", 1)[0], "")})
    for f in files.values():
        f.pop("docs")
    all_tests = [t for f in files.values() for t in f["tests"]]
    report = {
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "seconds": round(seconds, 1),
        "total": len(all_tests),
        "passed": sum(t["status"] == "passed" for t in all_tests),
        "failed": sum(t["status"] == "failed" for t in all_tests),
        "skipped": sum(t["status"] == "skipped" for t in all_tests),
        "files": sorted(files.values(), key=lambda f: f["file"]),
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{report['passed']}/{report['total']} pruebas superadas ({report['failed']} fallidas, "
          f"{report['skipped']} omitidas) en {report['seconds']} s -> {OUT}")
    sys.exit(proc.returncode)


if __name__ == "__main__":
    main()
