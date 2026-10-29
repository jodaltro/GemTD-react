"""Run Blender headlessly to validate and preview an exported GLB."""

from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a GLB with the installed Blender.")
    parser.add_argument("glb", type=Path, help="GLB to inspect")
    parser.add_argument("--report", type=Path, help="Destination JSON report")
    parser.add_argument("--preview", type=Path, help="Optional isometric preview PNG")
    args = parser.parse_args()

    blender = shutil.which("blender")
    if not blender:
        raise RuntimeError("Blender was not found on PATH.")
    glb = args.glb.resolve()
    report = (args.report or glb.parent / "qa.json").resolve()
    script = Path(__file__).resolve().parents[1] / "blender" / "validate_glb.py"
    command = [blender, "--background", "--python", str(script), "--", str(glb), str(report)]
    if args.preview:
        command.append(str(args.preview.resolve()))
    subprocess.run(command, check=True)
    if not report.exists():
        raise RuntimeError("Blender finished without producing the QA report.")
    if args.preview and not args.preview.resolve().exists():
        raise RuntimeError("Blender finished without producing the requested preview.")
    print(f"Blender QA report: {report}")


if __name__ == "__main__":
    main()
