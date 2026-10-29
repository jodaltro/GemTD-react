"""CLI entry point: a GemSpec JSON in, a deterministic GLB out."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .geometry import create_asset
from .glb import write_glb


def _validate(spec: dict) -> None:
    required = ("id", "kind", "seed", "material", "export")
    missing = [key for key in required if key not in spec]
    if missing:
        raise ValueError(f"Missing GemSpec fields: {', '.join(missing)}")
    if spec["kind"] not in {"crystal-cluster", "geode-egg", "organic-guardian"}:
        raise ValueError(f"Unsupported asset kind: {spec['kind']}")
    shape_key = {"crystal-cluster": "cluster", "geode-egg": "geode", "organic-guardian": "organic"}[spec["kind"]]
    if shape_key not in spec:
        raise ValueError(f"A {spec['kind']} requires a {shape_key} object.")
    if not isinstance(spec["seed"], int):
        raise ValueError("seed must be an integer")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a GemTD procedural GLB from a GemSpec JSON.")
    parser.add_argument("spec", type=Path, help="Path to the GemSpec JSON file.")
    parser.add_argument("--out-dir", type=Path, default=Path("out"), help="Root directory for per-asset bundles (default: out).")
    args = parser.parse_args()

    spec_path = args.spec.resolve()
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    _validate(spec)
    base, crystals = create_asset(spec)
    bundle = (Path.cwd() / args.out_dir / spec["id"]).resolve()
    bundle.mkdir(parents=True, exist_ok=True)
    # Preserve the exact source spec next to every derived artifact.
    (bundle / "spec.json").write_text(json.dumps(spec, indent=2), encoding="utf-8")
    output = bundle / "model.glb"
    write_glb(
        output,
        asset_id=spec["id"],
        base=base,
        crystals=crystals,
        material=spec["material"],
        metadata={"generator": spec["kind"], "seed": spec["seed"], "quality": spec.get("quality", "game-mobile")},
    )
    vfx = spec.get("vfx") or {
        "kind": "crystal-sparks", "count": 96, "radius": 0.85,
        "speed": [0.15, 0.8], "color": spec["material"].get("baseColor", "#c1122f"),
    }
    (bundle / "vfx.json").write_text(json.dumps(vfx, indent=2), encoding="utf-8")
    triangles = len(base.indices) // 3 + sum(len(crystal.indices) // 3 for crystal in crystals)
    print(f"Generated {spec['id']}: {output} ({triangles} triangles); bundle: {bundle}")


if __name__ == "__main__":
    main()
