"""Dependency-free mesh primitives used by the Asset Forge.

The generators deliberately work with vertices and triangular faces. This is the
same underlying representation demonstrated by tsoding/formula, but exported as
an actual PBR-ready GLB rather than projected as lines on a canvas.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import cos, pi, radians, sin, sqrt
from random import Random
from typing import Iterable

Vec3 = tuple[float, float, float]


def _sub(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _normalize(v: Vec3) -> Vec3:
    length = sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2) or 1.0
    return (v[0] / length, v[1] / length, v[2] / length)


def rotate(point: Vec3, degrees: Vec3) -> Vec3:
    """Apply X, then Y, then Z Euler rotations."""
    x, y, z = point
    rx, ry, rz = (radians(angle) for angle in degrees)

    y, z = y * cos(rx) - z * sin(rx), y * sin(rx) + z * cos(rx)
    x, z = x * cos(ry) + z * sin(ry), -x * sin(ry) + z * cos(ry)
    x, y = x * cos(rz) - y * sin(rz), x * sin(rz) + y * cos(rz)
    return (x, y, z)


@dataclass
class Mesh:
    """Flat-shaded triangle mesh. Every face owns its vertices for crisp facets."""

    name: str
    material_index: int = 1
    positions: list[Vec3] = field(default_factory=list)
    normals: list[Vec3] = field(default_factory=list)
    indices: list[int] = field(default_factory=list)

    def triangle(self, a: Vec3, b: Vec3, c: Vec3) -> None:
        normal = _normalize(_cross(_sub(b, a), _sub(c, a)))
        start = len(self.positions)
        self.positions.extend((a, b, c))
        self.normals.extend((normal, normal, normal))
        self.indices.extend((start, start + 1, start + 2))


def _transform(points: Iterable[Vec3], position: Vec3, rotation: Vec3) -> list[Vec3]:
    return [
        tuple(component + offset for component, offset in zip(rotate(point, rotation), position))
        for point in points
    ]


def add_crystal(
    mesh: Mesh,
    *,
    sides: int,
    height: float,
    radius: float,
    tip_sharpness: float,
    position: Vec3,
    rotation: Vec3,
    radial_multiplier: int = 1,
    body_segments: int = 1,
) -> None:
    """Add a high-density, closed gemstone prism with deliberately sharp facets."""
    sides = max(3, int(sides) * radial_multiplier)
    body_segments = max(1, int(body_segments))
    shoulder_y = height * (0.62 + (1.0 - tip_sharpness) * 0.16)
    shoulder_radius = radius * (0.70 + (1.0 - tip_sharpness) * 0.18)
    rings: list[list[Vec3]] = []
    for ring_index in range(body_segments + 1):
        fraction = ring_index / body_segments
        ring_radius = radius + (shoulder_radius - radius) * fraction
        ring_y = shoulder_y * fraction
        ring = []
        for side in range(sides):
            angle = side / sides * pi * 2 + pi / 4
            # Extra rings preserve high geometric density while retaining clean,
            # deliberately cut crystal planes rather than noisy corrugation.
            ring.append((cos(angle) * ring_radius, ring_y, sin(angle) * ring_radius))
        rings.append(_transform(ring, position, rotation))
    tip = _transform([(0.0, height, 0.0)], position, rotation)[0]
    bottom = _transform([(0.0, 0.0, 0.0)], position, rotation)[0]

    for ring_index in range(body_segments):
        for side in range(sides):
            next_side = (side + 1) % sides
            mesh.triangle(rings[ring_index][side], rings[ring_index][next_side],
                          rings[ring_index + 1][next_side])
            mesh.triangle(rings[ring_index][side], rings[ring_index + 1][next_side],
                          rings[ring_index + 1][side])
    for side in range(sides):
        next_side = (side + 1) % sides
        mesh.triangle(rings[-1][side], rings[-1][next_side], tip)
        mesh.triangle(rings[0][next_side], rings[0][side], bottom)


def add_rough_diamond(mesh: Mesh, *, radius: float, vertical_radius: float, position: Vec3, subdivisions: int, random: Random) -> None:
    """High-density rough octahedral diamond with coherent geological wear.

    A raw diamond is not a tall quartz prism. Its dominant habit is represented
    by eight broad octahedral faces; each receives bounded micro-erosion while
    retaining a readable, deliberately coarse macro faceting.
    """
    vertices = [
        (0.0, vertical_radius, 0.0), (0.0, -vertical_radius, 0.0),
        (-radius, 0.0, 0.0), (radius, 0.0, 0.0),
        (0.0, 0.0, -radius), (0.0, 0.0, radius),
    ]
    faces = [(0, 2, 4), (0, 4, 3), (0, 3, 5), (0, 5, 2), (1, 4, 2), (1, 3, 4), (1, 5, 3), (1, 2, 5)]
    subdivisions = max(3, int(subdivisions))
    for face_index, (ia, ib, ic) in enumerate(faces):
        a, b, c = vertices[ia], vertices[ib], vertices[ic]
        grid: list[list[Vec3]] = []
        phase = random.uniform(0, pi * 2)
        for row in range(subdivisions + 1):
            values: list[Vec3] = []
            for column in range(subdivisions + 1 - row):
                u, v = row / subdivisions, column / subdivisions
                w = 1 - u - v
                point = (a[0] * w + b[0] * u + c[0] * v, a[1] * w + b[1] * u + c[1] * v, a[2] * w + b[2] * u + c[2] * v)
                # Zero at shared edges: no cracks between the eight macro faces.
                edge_falloff = min(u, v, w) * 3
                radial = _normalize(point)
                wear = edge_falloff * radius * 0.028 * sin((u * 11 + v * 7 + face_index * 1.7) * pi + phase)
                values.append((position[0] + point[0] + radial[0] * wear, position[1] + point[1] + radial[1] * wear, position[2] + point[2] + radial[2] * wear))
            grid.append(values)
        for row in range(subdivisions):
            for column in range(subdivisions - row):
                mesh.triangle(grid[row][column], grid[row + 1][column], grid[row][column + 1])
                if column < subdivisions - row - 1:
                    mesh.triangle(grid[row + 1][column], grid[row + 1][column + 1], grid[row][column + 1])


def _quality_profile(quality: str) -> dict[str, int]:
    """Density presets. Hero is intentionally comparable to a high-detail prop."""
    profiles = {
        "draft": {"radial": 1, "macro_segments": 2, "macro_floor": 6, "micro_count": 0, "micro_segments": 1, "base_sides": 10, "base_rings": 2},
        "game-mobile": {"radial": 2, "macro_segments": 6, "macro_floor": 10, "micro_count": 24, "micro_segments": 4, "base_sides": 20, "base_rings": 5},
        "hero": {"radial": 4, "macro_segments": 24, "macro_floor": 28, "micro_count": 290, "micro_segments": 12, "base_sides": 48, "base_rings": 12},
    }
    return profiles.get(quality, profiles["hero"])


def create_cluster(spec: dict) -> tuple[Mesh, list[Mesh]]:
    """Build a crystal cluster and an independent high-detail rock base mesh."""
    random = Random(spec["seed"])
    cluster_spec = spec["cluster"]
    primary = cluster_spec["primaryCrystal"]
    satellites = cluster_spec["satellites"]
    base_radius = float(cluster_spec["baseRadius"])
    profile = _quality_profile(spec.get("quality", "hero"))
    solitary = cluster_spec.get("composition") == "solitary"

    crystals: list[Mesh] = []
    base = Mesh("Faceted_Base", material_index=0)
    _add_rock_base(base, base_radius, random, profile)

    primary_tilt = primary["tiltDegrees"]
    primary_mesh = Mesh("Crystal_Primary")
    if primary.get("form") == "rough-diamond":
        density = 64 if spec.get("quality", "hero") == "hero" else 28 if spec.get("quality") == "game-mobile" else 10
        vertical_radius = max(float(primary["radius"]) * 1.08, float(primary["height"]) * 0.34)
        # The diamond rests on the pedestal rather than being swallowed by it.
        add_rough_diamond(primary_mesh, radius=max(float(primary["radius"]), float(primary["height"]) * 0.28), vertical_radius=vertical_radius, position=(0.0, base_radius * 0.52 + vertical_radius, 0.0), subdivisions=density, random=random)
    else:
        add_crystal(
            primary_mesh,
            sides=primary["sides"],
            height=primary["height"],
            radius=primary["radius"],
            tip_sharpness=primary["tipSharpness"],
            position=(0.0, base_radius * 0.24, 0.0),
            rotation=(primary_tilt[0], primary_tilt[2], primary_tilt[1]),
            radial_multiplier=profile["radial"],
            body_segments=profile["macro_segments"] + 4,
        )
    crystals.append(primary_mesh)

    macro_count = int(satellites["count"]) if solitary else max(int(satellites["count"]), profile["macro_floor"])
    for index in range(macro_count):
        angle = index / macro_count * pi * 2 + random.uniform(-0.24, 0.24)
        distance = random.uniform(satellites["spreadRadius"] * 0.28, satellites["spreadRadius"])
        tilt = random.uniform(*satellites["tiltRangeDegrees"])
        macro_mesh = Mesh(f"Crystal_Macro_{index + 1:03d}")
        add_crystal(
            macro_mesh,
            sides=5 if random.random() > 0.5 else 6,
            height=random.uniform(*satellites["heightRange"]),
            radius=random.uniform(*satellites["radiusRange"]),
            tip_sharpness=random.uniform(0.72, 0.96),
            position=(cos(angle) * distance, base_radius * 0.18, sin(angle) * distance),
            rotation=(cos(angle) * tilt, angle * 180 / pi, -sin(angle) * tilt),
            radial_multiplier=profile["radial"],
            body_segments=profile["macro_segments"],
        )
        crystals.append(macro_mesh)
    for index in range(0 if solitary else profile["micro_count"]):
        angle = random.uniform(0, pi * 2)
        distance = random.uniform(base_radius * 0.12, base_radius * 1.08)
        tilt = random.uniform(6, 42)
        micro_mesh = Mesh(f"Crystal_Micro_{index + 1:03d}")
        add_crystal(
            micro_mesh,
            sides=random.choice((3, 4, 5)),
            height=random.uniform(base_radius * 0.14, base_radius * 0.52),
            radius=random.uniform(base_radius * 0.025, base_radius * 0.085),
            tip_sharpness=random.uniform(0.72, 0.99),
            position=(cos(angle) * distance, base_radius * 0.14, sin(angle) * distance),
            rotation=(cos(angle) * tilt, angle * 180 / pi, -sin(angle) * tilt),
            radial_multiplier=max(1, profile["radial"] // 2),
            body_segments=profile["micro_segments"],
        )
        crystals.append(micro_mesh)
    _ground((base, *crystals))
    return base, crystals


def _ground(meshes: tuple[Mesh, ...]) -> None:
    """Place the lowest generated point exactly on Y=0 for GemTD placement."""
    lowest = min(point[1] for mesh in meshes for point in mesh.positions)
    if abs(lowest) < 1e-9:
        return
    for mesh in meshes:
        mesh.positions[:] = [(x, y - lowest, z) for x, y, z in mesh.positions]


def _add_rock_base(mesh: Mesh, radius: float, random: Random, profile: dict[str, int]) -> None:
    """Make a layered, fractured pedestal that holds up under close inspection."""
    sides = profile["base_sides"]
    ring_count = profile["base_rings"]
    rings: list[list[Vec3]] = []
    radial_noise = [random.uniform(0.82, 1.06) for _ in range(sides)]
    for ring_index in range(ring_count + 1):
        fraction = ring_index / ring_count
        ring_radius = radius * (1.0 - fraction * 0.35)
        ring_y = radius * fraction * 0.52
        rings.append([
            (cos(index / sides * pi * 2) * ring_radius * radial_noise[index] * (1 + 0.025 * sin(ring_index * 2 + index)),
             ring_y,
             sin(index / sides * pi * 2) * ring_radius * radial_noise[index] * (1 + 0.025 * sin(ring_index * 2 + index)))
            for index in range(sides)
        ])
    top = (0.0, radius * 0.64, 0.0)
    bottom = (0.0, 0.0, 0.0)
    for ring_index in range(ring_count):
        for index in range(sides):
            next_index = (index + 1) % sides
            mesh.triangle(rings[ring_index][index], rings[ring_index][next_index], rings[ring_index + 1][next_index])
            mesh.triangle(rings[ring_index][index], rings[ring_index + 1][next_index], rings[ring_index + 1][index])
    for index in range(sides):
        next_index = (index + 1) % sides
        mesh.triangle(rings[-1][index], rings[-1][next_index], top)
        mesh.triangle(rings[0][next_index], rings[0][index], bottom)


def _add_egg_shell(mesh: Mesh, *, radius: float, height: float, random: Random, profile: dict[str, int]) -> None:
    """High-density, weathered egg with an intentionally open front cavity."""
    if profile["radial"] >= 4:  # Hero master: dense continuous sculpt surface.
        sides, rings = 256, 160
    elif profile["radial"] >= 2:
        sides, rings = 96, 64
    else:
        sides, rings = 32, 24
    phase_a, phase_b = random.uniform(0, 2 * pi), random.uniform(0, 2 * pi)
    shell: list[list[Vec3]] = []
    for ring_index in range(rings + 1):
        fraction = ring_index / rings
        # Egg silhouette: broad low-middle, gently pinched at the cap.
        body = sin(pi * fraction) ** 0.58
        taper = 1.06 - fraction * 0.18
        ring_radius = radius * body * taper
        ring_y = height * fraction
        ring = []
        for side in range(sides):
            angle = side / sides * pi * 2
            # Low-frequency displacement reads as carved/eroded stone at any
            # tessellation density; random per-vertex offsets would form spikes.
            radial_noise = 1 + 0.028 * sin(angle * 5 + ring_index * 0.16 + phase_a) + 0.014 * sin(angle * 11 - ring_index * 0.10 + phase_b)
            ring.append((cos(angle) * ring_radius * radial_noise, ring_y, sin(angle) * ring_radius * radial_noise))
        shell.append(ring)
    front = -pi / 2
    for ring_index in range(rings):
        fraction = (ring_index + 0.5) / rings
        for side in range(sides):
            angle = side / sides * pi * 2
            wrapped = abs((angle - front + pi) % (2 * pi) - pi)
            # The missing sector exposes the luminous geode core.
            cavity = wrapped < 0.72 and 0.18 < fraction < 0.84
            if cavity:
                continue
            next_side = (side + 1) % sides
            mesh.triangle(shell[ring_index][side], shell[ring_index][next_side], shell[ring_index + 1][next_side])
            mesh.triangle(shell[ring_index][side], shell[ring_index + 1][next_side], shell[ring_index + 1][side])


def _add_rock_blob(mesh: Mesh, *, position: Vec3, radius: float, height: float, random: Random, sides: int = 10, rings: int = 6) -> None:
    """A distinct weathered plate/boulder used to break up the egg shell."""
    rings_out: list[list[Vec3]] = []
    variation = [random.uniform(0.78, 1.22) for _ in range(sides)]
    for ring_index in range(rings + 1):
        fraction = ring_index / rings
        ring_radius = radius * sin(pi * fraction) ** 0.66
        ring_y = position[1] + (fraction - 0.5) * height
        rings_out.append([
            (position[0] + cos(side / sides * 2 * pi) * ring_radius * variation[side], ring_y,
             position[2] + sin(side / sides * 2 * pi) * ring_radius * variation[side])
            for side in range(sides)
        ])
    for ring_index in range(rings):
        for side in range(sides):
            next_side = (side + 1) % sides
            mesh.triangle(rings_out[ring_index][side], rings_out[ring_index][next_side], rings_out[ring_index + 1][next_side])
            mesh.triangle(rings_out[ring_index][side], rings_out[ring_index + 1][next_side], rings_out[ring_index + 1][side])


def _add_core(mesh: Mesh, *, position: Vec3, radius: float, height: float, profile: dict[str, int]) -> None:
    """A gently faceted, pale-blue geode core that sits inside the cavity."""
    sides = max(28, profile["base_sides"])
    rings = max(14, profile["base_rings"] * 2)
    layers: list[list[Vec3]] = []
    for ring_index in range(rings + 1):
        fraction = ring_index / rings
        ring_radius = radius * sin(pi * fraction) ** 0.72
        y = position[1] + (fraction - 0.5) * height
        layers.append([
            (position[0] + cos(side / sides * 2 * pi) * ring_radius, y,
             position[2] + sin(side / sides * 2 * pi) * ring_radius * 0.62)
            for side in range(sides)
        ])
    for ring_index in range(rings):
        for side in range(sides):
            next_side = (side + 1) % sides
            mesh.triangle(layers[ring_index][side], layers[ring_index][next_side], layers[ring_index + 1][next_side])
            mesh.triangle(layers[ring_index][side], layers[ring_index + 1][next_side], layers[ring_index + 1][side])


def _add_cavity_rim(mesh: Mesh, *, radius: float, height: float, random: Random, segments: int = 40) -> None:
    """A recessed rocky ring makes the glowing core read as a real cavity."""
    outer_x, outer_y = radius * 0.63, height * 0.34
    inner_x, inner_y = radius * 0.43, height * 0.235
    front_z, inner_z = -radius * 0.67, -radius * 0.53
    outer, inner = [], []
    for index in range(segments):
        angle = index / segments * 2 * pi
        wobble = random.uniform(0.91, 1.09)
        outer.append((cos(angle) * outer_x * wobble, height * 0.52 + sin(angle) * outer_y * wobble, front_z))
        inner.append((cos(angle) * inner_x, height * 0.52 + sin(angle) * inner_y, inner_z))
    for index in range(segments):
        next_index = (index + 1) % segments
        mesh.triangle(outer[index], outer[next_index], inner[next_index])
        mesh.triangle(outer[index], inner[next_index], inner[index])


def create_geode_egg(spec: dict) -> tuple[Mesh, list[Mesh]]:
    """Create the organic glowing geode-egg family used by the supplied reference."""
    random = Random(spec["seed"])
    geode = spec["geode"]
    profile = _quality_profile(spec.get("quality", "hero"))
    radius = float(geode["radius"])
    height = float(geode["height"])
    shell = Mesh("Geode_Egg_Shell", material_index=0)
    _add_egg_shell(shell, radius=radius, height=height, random=random, profile=profile)
    parts: list[Mesh] = []
    core = Mesh("Geode_Luminous_Core", material_index=1)
    _add_core(core, position=(0.0, height * 0.52, -radius * 0.45), radius=radius * float(geode["coreRadius"]), height=height * float(geode["coreHeight"]), profile=profile)
    parts.append(core)
    rim = Mesh("Geode_Cavity_Rim", material_index=0)
    _add_cavity_rim(rim, radius=radius, height=height, random=random, segments=56 if spec.get("quality", "hero") == "hero" else 24)
    parts.append(rim)
    # Loose rocks are opt-in. The reference preset is one carved, continuous egg.
    plate_count = round(float(geode.get("loosePlates", 0)))
    for index in range(plate_count):
        angle = random.uniform(-pi, pi)
        # Keep the central cavity readable; plates may build up only around it.
        while abs((angle + pi / 2 + pi) % (2 * pi) - pi) < 0.76:
            angle = random.uniform(-pi, pi)
        vertical = random.uniform(0.12, 0.91)
        plate = Mesh(f"Geode_Rock_Plate_{index + 1:03d}", material_index=0)
        shell_radius = radius * sin(pi * vertical) ** 0.58 * (1.06 - vertical * 0.18)
        _add_rock_blob(
            plate,
            position=(cos(angle) * shell_radius, height * vertical, sin(angle) * shell_radius),
            radius=random.uniform(radius * 0.07, radius * 0.15),
            height=random.uniform(height * 0.045, height * 0.105),
            random=random,
            sides=12 if spec.get("quality", "hero") == "hero" else 7,
            rings=8 if spec.get("quality", "hero") == "hero" else 4,
        )
        parts.append(plate)
    _ground((shell, *parts))
    return shell, parts


def _add_organic_ellipsoid(mesh: Mesh, *, position: Vec3, scale: Vec3, radial: int, rings: int, random: Random, irregularity: float = 0.0) -> None:
    """Dense continuous volume for anatomy masses; noise is coherent, never spiky."""
    layers: list[list[Vec3]] = []
    phase = random.uniform(0, pi * 2)
    for ring_index in range(rings + 1):
        latitude = ring_index / rings * pi
        horizontal = sin(latitude)
        y = -cos(latitude) * scale[1]
        layer: list[Vec3] = []
        for side in range(radial):
            angle = side / radial * pi * 2
            noise = 1 + irregularity * (0.65 * sin(angle * 5 + ring_index * 0.19 + phase) + 0.35 * sin(angle * 9 - ring_index * 0.11))
            layer.append((position[0] + cos(angle) * horizontal * scale[0] * noise,
                          position[1] + y * (1 + irregularity * 0.25 * sin(angle * 3 + phase)),
                          position[2] + sin(angle) * horizontal * scale[2] * noise))
        layers.append(layer)
    for ring_index in range(rings):
        for side in range(radial):
            next_side = (side + 1) % radial
            mesh.triangle(layers[ring_index][side], layers[ring_index][next_side], layers[ring_index + 1][next_side])
            mesh.triangle(layers[ring_index][side], layers[ring_index + 1][next_side], layers[ring_index + 1][side])


def _add_tube_path(mesh: Mesh, *, points: list[Vec3], radius: float, sides: int, random: Random) -> None:
    """Tapered limb/tail volume following artist-like joint landmarks."""
    rings: list[list[Vec3]] = []
    for index, point in enumerate(points):
        previous = points[max(0, index - 1)]
        following = points[min(len(points) - 1, index + 1)]
        direction = _normalize(_sub(following, previous))
        tangent = _cross(direction, (0.0, 1.0, 0.0))
        if sqrt(sum(component * component for component in tangent)) < 0.001:
            tangent = _cross(direction, (1.0, 0.0, 0.0))
        tangent = _normalize(tangent)
        bitangent = _normalize(_cross(direction, tangent))
        taper = 1.0 - index / max(1, len(points) - 1) * 0.46
        ring = []
        for side in range(sides):
            angle = side / sides * pi * 2
            wobble = 1 + random.uniform(-0.045, 0.045)
            width = radius * taper * wobble
            ring.append((point[0] + tangent[0] * cos(angle) * width + bitangent[0] * sin(angle) * width,
                         point[1] + tangent[1] * cos(angle) * width + bitangent[1] * sin(angle) * width,
                         point[2] + tangent[2] * cos(angle) * width + bitangent[2] * sin(angle) * width))
        rings.append(ring)
    for index in range(len(rings) - 1):
        for side in range(sides):
            next_side = (side + 1) % sides
            mesh.triangle(rings[index][side], rings[index][next_side], rings[index + 1][next_side])
            mesh.triangle(rings[index][side], rings[index + 1][next_side], rings[index + 1][side])
    for side in range(sides):
        next_side = (side + 1) % sides
        mesh.triangle(points[0], rings[0][next_side], rings[0][side])
        mesh.triangle(points[-1], rings[-1][side], rings[-1][next_side])


def create_organic_guardian(spec: dict) -> tuple[Mesh, list[Mesh]]:
    """Create an unrigged but separately editable creature/golem master.

    The parts deliberately resemble a sculptor's blocking workflow: first a
    continuous torso, then head and articulated limbs, then armor plates and
    optional tail. A future rigging tool can consume these named pieces.
    """
    random = Random(spec["seed"])
    organic = spec["organic"]
    body_spec, limbs_spec, armor_spec = organic["body"], organic["limbs"], organic["armor"]
    length, width, height = (float(body_spec[key]) for key in ("length", "width", "height"))
    quality = spec.get("quality", "hero")
    if quality == "hero":
        body_radial, body_rings, head_radial, head_rings, limb_sides = 256, 144, 160, 96, 32
    elif quality == "game-mobile":
        body_radial, body_rings, head_radial, head_rings, limb_sides = 96, 52, 64, 38, 18
    else:
        body_radial, body_rings, head_radial, head_rings, limb_sides = 32, 20, 24, 16, 10

    body = Mesh("Organic_Body", material_index=1)
    _add_organic_ellipsoid(body, position=(0.0, height * 0.54, 0.0), scale=(width * 0.5, height * 0.5, length * 0.5), radial=body_radial, rings=body_rings, random=random, irregularity=0.035)
    parts: list[Mesh] = []
    head_scale = float(body_spec["headScale"])
    head = Mesh("Organic_Head", material_index=1)
    _add_organic_ellipsoid(head, position=(0.0, height * 0.66, -length * 0.48), scale=(width * head_scale * 0.46, height * head_scale * 0.43, length * head_scale * 0.34), radial=head_radial, rings=head_rings, random=random, irregularity=0.022)
    parts.append(head)

    limb_count = int(limbs_spec["count"])
    limb_length, limb_radius, stance = (float(limbs_spec[key]) for key in ("length", "radius", "stance"))
    for index in range(limb_count):
        side = -1.0 if index % 2 == 0 else 1.0
        pair = index // 2
        pair_count = max(1, (limb_count + 1) // 2)
        along = (-0.34 + (pair / max(1, pair_count - 1)) * 0.68) * length if pair_count > 1 else 0.0
        hip = (side * width * 0.42, height * 0.55, along)
        knee = (side * width * (0.63 + stance * 0.24), height * 0.23, along + (0.13 if pair % 2 else -0.10) * limb_length)
        foot = (side * width * (0.72 + stance * 0.38), max(limb_radius * 0.75, 0.045), along - limb_length * 0.36)
        limb = Mesh(f"Organic_Limb_{index + 1:02d}", material_index=1)
        _add_tube_path(limb, points=[hip, knee, foot], radius=limb_radius, sides=limb_sides, random=random)
        parts.append(limb)

    tail_length = float(organic["tailLength"])
    if tail_length > 0.02:
        tail = Mesh("Organic_Tail", material_index=1)
        tail_points = [(0.0, height * 0.56, length * 0.43), (0.0, height * 0.48, length * 0.58 + tail_length * 0.30), (0.0, height * 0.30, length * 0.58 + tail_length * 0.72), (0.0, height * 0.18, length * 0.56 + tail_length)]
        _add_tube_path(tail, points=tail_points, radius=max(0.035, width * 0.18), sides=limb_sides, random=random)
        parts.append(tail)

    plate_count, plate_scale, spike_length = int(armor_spec["plateCount"]), float(armor_spec["plateScale"]), float(armor_spec["spikeLength"])
    for index in range(plate_count):
        progress = (index + 0.5) / plate_count
        z = (-0.42 + progress * 0.84) * length
        row = index % 3
        x = 0.0 if row == 0 else (-1.0 if row == 1 else 1.0) * width * 0.37
        crown = max(0.15, 1 - (z / max(length * 0.52, 0.01)) ** 2)
        y = height * (0.54 + 0.42 * sqrt(crown)) - (0.0 if row == 0 else height * 0.12)
        plate = Mesh(f"Organic_Armor_Plate_{index + 1:03d}", material_index=0)
        _add_organic_ellipsoid(plate, position=(x, y, z), scale=(plate_scale * (0.8 if row == 0 else 0.55), plate_scale * 0.22, plate_scale * 1.05), radial=18 if quality == "hero" else 10, rings=10 if quality == "hero" else 5, random=random, irregularity=0.08)
        if spike_length > 0.008 and row == 0:
            add_crystal(plate, sides=5, height=spike_length, radius=plate_scale * 0.32, tip_sharpness=0.92, position=(x, y + plate_scale * 0.13, z), rotation=(0.0, 0.0, 0.0), radial_multiplier=2 if quality == "hero" else 1, body_segments=6 if quality == "hero" else 2)
        parts.append(plate)
    _ground((body, *parts))
    return body, parts


def create_asset(spec: dict) -> tuple[Mesh, list[Mesh]]:
    """Route only known asset kinds to their deterministic generators."""
    if spec["kind"] == "crystal-cluster":
        return create_cluster(spec)
    if spec["kind"] == "geode-egg":
        return create_geode_egg(spec)
    if spec["kind"] == "organic-guardian":
        return create_organic_guardian(spec)
    raise ValueError(f"Unsupported asset kind: {spec['kind']}")
