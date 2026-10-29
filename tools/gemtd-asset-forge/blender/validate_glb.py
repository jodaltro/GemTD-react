"""Blender-side finishing, QA and preview for an exported GemTD GLB.

The Python generator owns topology. This script applies only a constrained
ArtSpec: edge finishing, a procedural material and a VFX emitter marker.
It never evaluates instructions or code returned by the LLM.
"""

import json
import sys
from math import radians
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def arguments():
    separator = sys.argv.index("--")
    values = sys.argv[separator + 1:]
    if len(values) < 2:
        raise ValueError("Expected: <input.glb> <report.json> [preview.png]")
    return Path(values[0]), Path(values[1]), Path(values[2]) if len(values) > 2 else None


def spec_for(source):
    paths = (source.parent / "spec.json", source.parent.parent / "specs" / f"{source.stem}.json")
    for path in paths:
        if not path.exists():
            continue
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
    return {}


def hex_colour(value, fallback):
    if isinstance(value, str) and len(value) == 7 and value.startswith("#"):
        try:
            return tuple(int(value[index:index + 2], 16) / 255 for index in (1, 3, 5)) + (1.0,)
        except ValueError:
            pass
    return fallback


def input_value(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def apply_surface_tool(obj, surface):
    """Run one allow-listed surface treatment selected by the ArtSpec."""
    mode = surface.get("mode", "softened")
    if mode == "faceted":
        return
    modifier = obj.modifiers.new(f"ArtSpec_Surface_{mode}", "LAPLACIANSMOOTH")
    modifier.iterations = int(surface.get("iterations", 1))
    modifier.lambda_factor = float(surface.get("strength", 0.035))
    modifier.lambda_border = modifier.lambda_factor * 0.45
    modifier.use_volume_preserve = bool(surface.get("preserveVolume", True))
    modifier.use_normalized = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def finish_edges(meshes, finish, surface):
    """Weld source triangles, sculpt if selected, then bevel their hard edges."""
    radius = float(finish.get("edgeRadius", 0.012))
    segments = int(finish.get("bevelSegments", 3))
    angle = radians(float(finish.get("smoothAngleDegrees", 32)))
    for obj in meshes:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.000001)
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        apply_surface_tool(obj, surface)
        # A continuous carved shell has no separate hard parts to bevel. Beveling
        # every dense triangle creates artificial horizontal bands instead.
        if obj.name == "Geode_Egg_Shell":
            continue
        largest_dimension = max(obj.dimensions)
        # Satellites retain their silhouette instead of becoming rounded blobs.
        width = min(radius, largest_dimension * 0.03)
        if width < 0.00015:
            continue
        modifier = obj.modifiers.new("ArtSpec_Edge_Soften", "BEVEL")
        modifier.width = width
        modifier.segments = segments
        modifier.limit_method = "ANGLE"
        modifier.angle_limit = angle
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)


def apply_gem_material(meshes, material_spec, texture_spec):
    """Create an editable procedural PBR material for the Blender master file."""
    gem = bpy.data.materials.get("Gem") or bpy.data.materials.new("Gem")
    gem.use_nodes = True
    nodes = gem.node_tree.nodes
    links = gem.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (420, 0)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-540, 0)
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = 5.5
    noise.inputs["Detail"].default_value = 5.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-230, 20)
    base = hex_colour(material_spec.get("baseColor"), (0.76, 0.03, 0.12, 1.0))
    contrast = float(texture_spec.get("veinContrast", 0.35))
    dark = tuple(channel * (1 - contrast * 0.72) for channel in base[:3]) + (1.0,)
    ramp.color_ramp.elements[0].color = dark
    ramp.color_ramp.elements[1].color = base
    bump = nodes.new("ShaderNodeBump")
    bump.location = (170, -180)
    bump.inputs["Strength"].default_value = float(texture_spec.get("normalStrength", 0.32))
    bump.inputs["Distance"].default_value = 0.08
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    input_value(shader, "Metallic", float(material_spec.get("metalness", 0.03)))
    input_value(shader, "Roughness", float(material_spec.get("roughness", 0.2)))
    input_value(shader, "Transmission Weight", float(material_spec.get("transmission", 0.08)))
    input_value(shader, "IOR", 1.45)
    input_value(shader, "Emission Color", hex_colour(material_spec.get("emissive"), (0.12, 0.0, 0.02, 1.0)))
    input_value(shader, "Emission Strength", float(material_spec.get("emissiveIntensity", 0.55)))
    for obj in meshes:
        if obj.name.startswith(("Crystal", "Geode_Luminous", "Organic_Body", "Organic_Head", "Organic_Limb", "Organic_Tail")):
            obj.data.materials.clear()
            obj.data.materials.append(gem)
    gem["texturePattern"] = str(texture_spec.get("pattern", "subtle internal crystalline veins"))
    gem["requestedTextureResolution"] = int(texture_spec.get("resolution", 4096))


def apply_rock_material(material_spec):
    """Give geode shells a rough, layered stone material in the Blender master."""
    if not material_spec.get("rockColor"):
        return
    rock = bpy.data.materials.get("Base")
    if not rock:
        return
    rock.use_nodes = True
    nodes = rock.node_tree.nodes
    links = rock.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (330, 0)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-420, 0)
    noise.inputs["Scale"].default_value = 7.5
    noise.inputs["Detail"].default_value = 7.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-150, 0)
    rock_colour = hex_colour(material_spec.get("rockColor"), (0.24, 0.22, 0.19, 1.0))
    ramp.color_ramp.elements[0].color = tuple(channel * 0.38 for channel in rock_colour[:3]) + (1.0,)
    ramp.color_ramp.elements[1].color = rock_colour
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    input_value(shader, "Roughness", 0.84)


def add_vfx_emitter(center, vfx):
    """An editable marker; actual particles are rendered by the game runtime."""
    bpy.ops.object.empty_add(type="SPHERE", location=center)
    emitter = bpy.context.object
    emitter.name = "VFX_Emitter"
    emitter.empty_display_size = float(vfx.get("radius", 0.85))
    emitter["vfxKind"] = str(vfx.get("kind", "crystal-sparks"))
    emitter["particleCount"] = int(vfx.get("count", 96))
    emitter["radius"] = float(vfx.get("radius", 0.85))
    emitter["speedMin"] = float(vfx.get("speed", [0.15, 0.8])[0])
    emitter["speedMax"] = float(vfx.get("speed", [0.15, 0.8])[1])
    emitter["colour"] = str(vfx.get("color", "#ff6b81"))


def look_at(obj, point=(0.0, 0.5, 0.0)):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_preview_camera(low, high, output, front=False):
    center = (low + high) * 0.5
    radius = max((high - low).length * 0.85, 1.2)
    camera_offset = Vector((0.0, radius * 1.35, radius * 0.08)) if front else Vector((radius, radius * 0.72, radius))
    bpy.ops.object.camera_add(location=center + camera_offset)
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = radius * 2.1
    look_at(camera, center)
    bpy.context.scene.camera = camera
    bpy.ops.object.light_add(type="AREA", location=center + Vector((2.5, 4.0, 3.0)))
    key = bpy.context.object
    key.data.energy = 800
    key.data.shape = "DISK"
    key.data.size = 4
    look_at(key, center)
    bpy.ops.object.light_add(type="AREA", location=center + Vector((-3.0, 2.0, 1.0)))
    fill = bpy.context.object
    fill.data.energy = 320
    fill.data.size = 3
    look_at(fill, center)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(output)
    scene.world.color = (0.018, 0.022, 0.035)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)


def mesh_bounds(meshes):
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    return (
        Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points))),
        Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points))),
    )


def main():
    source, report_path, preview_path = arguments()
    spec = spec_for(source)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("GLB did not import any mesh objects.")
    finish = spec.get("finish") or {"edgeRadius": 0.012, "bevelSegments": 3, "smoothAngleDegrees": 32}
    surface = spec.get("surface") or {"mode": "softened", "iterations": 1, "strength": 0.035, "preserveVolume": True}
    texture = spec.get("texture") or {"resolution": 4096, "pattern": "subtle internal crystalline veins", "veinContrast": 0.35, "normalStrength": 0.32}
    vfx = spec.get("vfx") or {"kind": "crystal-sparks", "count": 96, "radius": 0.85, "speed": [0.15, 0.8], "color": "#ff6b81"}
    finish_edges(meshes, finish, surface)
    apply_gem_material(meshes, spec.get("material", {}), texture)
    apply_rock_material(spec.get("material", {}))
    lower, upper = mesh_bounds(meshes)
    add_vfx_emitter((lower + upper) * 0.5, vfx)
    polished_path = source.with_name(f"{source.stem}-polished.glb")
    bpy.ops.export_scene.gltf(filepath=str(polished_path), export_format="GLB", export_extras=True)
    triangle_count = sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in meshes)
    report = {
        "source": str(source), "polishedGlbPath": str(polished_path), "meshCount": len(meshes),
        "triangles": triangle_count,
        "materials": sorted({material.name for obj in meshes for material in obj.data.materials if material}),
        "bounds": {"min": list(lower), "max": list(upper)}, "grounded": abs(lower.z) < 0.01,
        "artSpec": {"edgeRadius": finish["edgeRadius"], "surfaceMode": surface["mode"], "textureResolution": texture["resolution"], "vfxKind": vfx["kind"]},
        "status": "pass" if triangle_count > 0 and polished_path.exists() else "fail",
    }
    blend_path = source.with_suffix(".blend")
    report["blendPath"] = str(blend_path)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    if preview_path:
        add_preview_camera(lower, upper, preview_path, front=spec.get("kind") == "geode-egg")
    # This is a generated bundle, not an artist's live source file: avoid
    # accumulating Blender's numbered backup files on every validation run.
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))


if __name__ == "__main__":
    main()
