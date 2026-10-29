"""Tiny dependency-free GLB 2.0 writer for procedural GemTD meshes."""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path

from .geometry import Mesh

ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963


def _pad(data: bytearray, alignment: int = 4) -> None:
    data.extend(b"\0" * ((-len(data)) % alignment))


def _hex_color(value: str) -> list[float]:
    value = value.removeprefix("#")
    if len(value) != 6:
        raise ValueError(f"Expected a #RRGGBB color, got {value!r}")
    return [int(value[offset:offset + 2], 16) / 255 for offset in (0, 2, 4)]


def _bounds(points: list[tuple[float, float, float]]) -> tuple[list[float], list[float]]:
    return (
        [min(point[axis] for point in points) for axis in range(3)],
        [max(point[axis] for point in points) for axis in range(3)],
    )


@dataclass
class _Binary:
    data: bytearray
    buffer_views: list[dict]
    accessors: list[dict]

    def add_floats(self, values: list[tuple[float, float, float]], target: int, include_bounds: bool) -> int:
        _pad(self.data)
        offset = len(self.data)
        for value in values:
            self.data.extend(struct.pack("<3f", *value))
        view_index = len(self.buffer_views)
        self.buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(values) * 12, "target": target})
        accessor = {"bufferView": view_index, "componentType": 5126, "count": len(values), "type": "VEC3"}
        if include_bounds:
            accessor["min"], accessor["max"] = _bounds(values)
        self.accessors.append(accessor)
        return len(self.accessors) - 1

    def add_indices(self, values: list[int]) -> int:
        _pad(self.data)
        offset = len(self.data)
        self.data.extend(struct.pack(f"<{len(values)}I", *values))
        view_index = len(self.buffer_views)
        self.buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(values) * 4, "target": ELEMENT_ARRAY_BUFFER})
        self.accessors.append({"bufferView": view_index, "componentType": 5125, "count": len(values), "type": "SCALAR", "min": [min(values)], "max": [max(values)]})
        return len(self.accessors) - 1


def write_glb(path: Path, *, asset_id: str, base: Mesh, crystals: list[Mesh], material: dict, metadata: dict) -> None:
    binary = _Binary(bytearray(), [], [])
    all_meshes = [base, *crystals]
    gltf_meshes = []
    for mesh in all_meshes:
        position = binary.add_floats(mesh.positions, ARRAY_BUFFER, include_bounds=True)
        normal = binary.add_floats(mesh.normals, ARRAY_BUFFER, include_bounds=False)
        indices = binary.add_indices(mesh.indices)
        gltf_meshes.append({"name": mesh.name, "primitives": [{"attributes": {"POSITION": position, "NORMAL": normal}, "indices": indices, "material": mesh.material_index}]})
    _pad(binary.data)

    color = _hex_color(material["baseColor"])
    emissive = _hex_color(material["emissive"])
    rock = _hex_color(material["rockColor"]) if material.get("rockColor") else [value * 0.26 for value in color]
    root = {
        "asset": {"version": "2.0", "generator": "GemTD Asset Forge (Python)"},
        "extensionsUsed": ["KHR_materials_transmission"],
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": asset_id, "children": list(range(1, len(gltf_meshes) + 1)), "extras": metadata}, *({"mesh": index} for index in range(len(gltf_meshes)))],
        "meshes": gltf_meshes,
        "materials": [
            {"name": "Base", "pbrMetallicRoughness": {"baseColorFactor": rock + [1], "metallicFactor": 0.02, "roughnessFactor": 0.78}},
            {"name": "Gem", "pbrMetallicRoughness": {"baseColorFactor": color + [1], "metallicFactor": material["metalness"], "roughnessFactor": material["roughness"]}, "emissiveFactor": emissive, "emissiveStrength": material["emissiveIntensity"], "extensions": {"KHR_materials_transmission": {"transmissionFactor": material["transmission"]}}},
        ],
        "buffers": [{"byteLength": len(binary.data)}],
        "bufferViews": binary.buffer_views,
        "accessors": binary.accessors,
    }
    json_chunk = bytearray(json.dumps(root, separators=(",", ":")).encode("utf-8"))
    json_chunk.extend(b" " * ((-len(json_chunk)) % 4))
    total_length = 12 + 8 + len(json_chunk) + 8 + len(binary.data)
    glb = bytearray(struct.pack("<4sII", b"glTF", 2, total_length))
    glb.extend(struct.pack("<I4s", len(json_chunk), b"JSON"))
    glb.extend(json_chunk)
    glb.extend(struct.pack("<I4s", len(binary.data), b"BIN\0"))
    glb.extend(binary.data)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(glb)
