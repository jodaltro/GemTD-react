"""Candidate-program generation for the Asset Forge 2 decision loop.

Candidates are deterministic, inspectable mutations of a safe ArtSpec.  The
LLM/Jev chooses between programs; neither model supplies arbitrary geometry or
Blender code.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any


def make_candidates(spec: dict[str, Any], count: int = 9) -> list[dict[str, Any]]:
    """Create a compact diverse beam around a normalised source ArtSpec."""
    count = max(3, min(int(count), 16))
    variants: list[dict[str, Any]] = []
    if spec["kind"] == "geode-egg":
        deltas = [(-0.10, -0.08, -0.08), (-0.06, 0.04, 0.05), (-0.03, 0.10, -0.04),
                  (0.0, 0.0, 0.0), (0.04, -0.05, 0.08), (0.07, 0.06, -0.06),
                  (0.10, 0.12, 0.03), (-0.08, 0.14, 0.08), (0.12, -0.12, -0.10)]
        for index in range(count):
            radius_delta, height_delta, core_delta = deltas[index % len(deltas)]
            candidate = deepcopy(spec)
            geode = candidate["geode"]
            geode["radius"] = round(max(0.35, min(1.4, geode["radius"] * (1 + radius_delta))), 4)
            geode["height"] = round(max(0.8, min(3.5, geode["height"] * (1 + height_delta))), 4)
            geode["coreRadius"] = round(max(0.2, min(0.75, geode["coreRadius"] * (1 + core_delta))), 4)
            candidate["surface"]["strength"] = round(max(0.02, min(0.16, candidate["surface"]["strength"] + (index % 3 - 1) * 0.018)), 3)
            candidate["finish"]["edgeRadius"] = round(max(0.002, candidate["finish"]["edgeRadius"] + (index % 2) * 0.002), 4)
            variants.append(candidate)
    elif spec["kind"] == "crystal-cluster":
        deltas = [(-0.14, -0.10, -2), (-0.08, 0.06, 1), (-0.04, 0.12, -1),
                  (0.0, 0.0, 0), (0.04, -0.06, 2), (0.08, 0.08, -2),
                  (0.12, 0.14, 1), (-0.10, 0.10, 2), (0.10, -0.12, -1)]
        for index in range(count):
            height_delta, radius_delta, satellite_delta = deltas[index % len(deltas)]
            candidate = deepcopy(spec)
            primary = candidate["cluster"]["primaryCrystal"]
            satellites = candidate["cluster"]["satellites"]
            primary["height"] = round(max(0.35, min(3.0, primary["height"] * (1 + height_delta))), 4)
            primary["radius"] = round(max(0.05, min(0.9, primary["radius"] * (1 + radius_delta))), 4)
            satellites["count"] = 0 if candidate["cluster"].get("composition") == "solitary" else max(0, min(15, satellites["count"] + satellite_delta))
            primary["tipSharpness"] = round(max(0.4, min(0.99, primary["tipSharpness"] + (index % 3 - 1) * 0.035)), 3)
            variants.append(candidate)
    else:
        deltas = [(-0.10, -0.08, -4), (-0.06, 0.05, 2), (-0.02, 0.10, -2),
                  (0.0, 0.0, 0), (0.04, -0.06, 4), (0.08, 0.08, -3),
                  (0.12, 0.14, 3), (-0.08, 0.12, 5), (0.10, -0.11, -5)]
        for index in range(count):
            length_delta, head_delta, plate_delta = deltas[index % len(deltas)]
            candidate = deepcopy(spec)
            body = candidate["organic"]["body"]
            armor = candidate["organic"]["armor"]
            limbs = candidate["organic"]["limbs"]
            body["length"] = round(max(0.55, min(3.6, body["length"] * (1 + length_delta))), 4)
            body["headScale"] = round(max(0.2, min(1.25, body["headScale"] * (1 + head_delta))), 4)
            armor["plateCount"] = max(0, min(96, armor["plateCount"] + plate_delta))
            limbs["stance"] = round(max(0.0, min(1.0, limbs["stance"] + (index % 3 - 1) * 0.10)), 3)
            variants.append(candidate)

    for index, candidate in enumerate(variants, start=1):
        candidate_id = f"c{index:02d}"
        candidate["candidateId"] = candidate_id
        candidate["parentAssetId"] = spec["id"]
        candidate["id"] = f"{spec['id']}-{candidate_id}"
        candidate["seed"] = (int(spec["seed"]) + index * 104729) & 0xFFFFFFFF
        candidate["export"] = {"targetTriangles": spec["export"]["targetTriangles"], "output": f"candidates/{candidate_id}/model.glb"}
    return variants


def summary(spec: dict[str, Any], triangles: int, mesh_count: int) -> str:
    """Compact, stable record fed to the decision model; no executable content."""
    surface = spec.get("surface", {})
    if spec["kind"] == "geode-egg":
        shape = spec["geode"]
        detail = f"egg radius={shape['radius']}, height={shape['height']}, coreRadius={shape['coreRadius']}, coreHeight={shape['coreHeight']}"
    elif spec["kind"] == "crystal-cluster":
        shape = spec["cluster"]
        primary = shape["primaryCrystal"]
        detail = f"crystal height={primary['height']}, radius={primary['radius']}, sides={primary['sides']}, satellites={shape['satellites']['count']}"
    else:
        shape = spec["organic"]
        body, limbs, armor = shape["body"], shape["limbs"], shape["armor"]
        detail = f"guardian body length={body['length']}, width={body['width']}, headScale={body['headScale']}, limbs={limbs['count']}, plates={armor['plateCount']}, tail={shape['tailLength']}"
    return f"{spec['candidateId']}: kind={spec['kind']}; {detail}; surface={surface.get('mode')} strength={surface.get('strength')}; triangles={triangles}; namedMeshes={mesh_count}"


def construction_plan(spec: dict[str, Any]) -> list[dict[str, Any]]:
    """A human-like build order: silhouette first, detail and appearance last."""
    if spec["kind"] == "geode-egg":
        return [
            {"id": "01-massing", "goal": "Validate the continuous egg silhouette and ground contact.", "include": []},
            {"id": "02-carve-cavity", "goal": "Validate the recessed rocky cavity rim before adding luminosity.", "include": ["Geode_Cavity_Rim"]},
            {"id": "03-place-core", "goal": "Validate core size, position and cavity readability.", "include": ["Geode_Cavity_Rim", "Geode_Luminous_Core"]},
            {"id": "04-finish", "goal": "Apply sculpting, rock/gem materials and VFX to the approved assembly.", "include": ["*"]},
        ]
    if spec["kind"] == "organic-guardian":
        return [
            {"id": "01-massing", "goal": "Validate torso silhouette, scale and ground contact before anatomy.", "include": []},
            {"id": "02-anatomy", "goal": "Validate head, limb reach and static pose before armor.", "include": ["Organic_Head", "Organic_Limb_", "Organic_Tail"]},
            {"id": "03-armor", "goal": "Validate plate rhythm, overlaps and protected silhouette.", "include": ["Organic_Head", "Organic_Limb_", "Organic_Tail", "Organic_Armor_Plate_"]},
            {"id": "04-finish", "goal": "Apply sculpting, material response and VFX to the approved creature master.", "include": ["*"]},
        ]
    return [
        {"id": "01-base", "goal": "Validate grounded base mass and occupied footprint.", "include": []},
        {"id": "02-primary", "goal": "Validate the dominant crystal silhouette.", "include": ["Crystal_Primary"]},
        {"id": "03-macro", "goal": "Validate major supporting crystals and composition.", "include": ["Crystal_Primary", "Crystal_Macro_"]},
        {"id": "04-detail", "goal": "Add micro crystals, finishing and VFX only after the composition passes.", "include": ["*"]},
    ]
