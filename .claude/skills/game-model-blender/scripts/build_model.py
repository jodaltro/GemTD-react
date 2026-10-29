"""build_model.py — template de geração de GLB via Blender embedado (bpy).

Uso (da raiz do projeto):
    py -3.13 .claude/skills/game-model-blender/scripts/build_model.py public/glb/<nome>.glb [--preview]

O script:
  1. Limpa a cena
  2. build() constrói o modelo (EDITAR AQUI)
  3. Assenta o ponto mais baixo em Y=0 e exporta GLB (materiais aplicados, Y-up)
  4. --preview: renderiza um PNG ao lado do GLB para conferência

Técnica-chave p/ orgânicos: skeleton de arestas -> Skin modifier -> Subdivision Surface.
Ver SKILL.md para a tabela de decisão de técnicas.
"""

import sys
import math
import bpy
import bmesh
from mathutils import Vector

# ─── Utilidades de cena ───────────────────────────────────────────────────────

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb_to_linear(hexstr):
    """'#d50000' -> (r,g,b) linear para Base Color do Blender."""
    h = hexstr.lstrip('#')
    r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b))


def make_material(name, hexcolor, roughness=0.8, metallic=0.0,
                  emission_hex=None, emission_strength=0.0, alpha=1.0, transmission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    r, g, b = srgb_to_linear(hexcolor)
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    if emission_hex:
        er, eg, eb = srgb_to_linear(emission_hex)
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (er, eg, eb, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = 'BLEND'
    return mat


def new_mesh_obj(name, mat=None):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    return obj


def set_active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def skinned_limb(name, points, radii, mat, subsurf=2, smooth=True, root_index=0):
    """Cria um membro/corpo orgânico a partir de uma polilinha de pontos.

    points: lista de (x,y,z) — vértices conectados em cadeia (e/ou ramificações
            via 'edges' custom, ver build()). radii: raio por vértice (float ou
            lista). Aplica Skin + Subdivision Surface -> volume liso contínuo.
    """
    obj = new_mesh_obj(name, mat)
    bm = bmesh.new()
    verts = [bm.verts.new(p) for p in points]
    bm.verts.ensure_lookup_table()
    for i in range(len(verts) - 1):
        bm.edges.new((verts[i], verts[i + 1]))
    bm.to_mesh(obj.data)
    bm.free()

    skin = obj.modifiers.new("Skin", 'SKIN')
    obj.data.skin_vertices  # ensure layer
    skin_layer = obj.data.skin_vertices[0].data
    if isinstance(radii, (int, float)):
        radii = [radii] * len(points)
    for i, r in enumerate(radii):
        skin_layer[i].radius = (r, r)
    skin_layer[root_index].use_root = True

    if subsurf:
        sub = obj.modifiers.new("Subsurf", 'SUBSURF')
        sub.levels = subsurf
        sub.render_levels = subsurf
    if smooth:
        set_active(obj)
        bpy.ops.object.shade_smooth()
    return obj


def skinned_skeleton(name, points, edges, radii, mat, subsurf=2, smooth=True,
                     root_index=0, faceted=False):
    """Corpo orgânico contínuo (skin) de um esqueleto de arestas ramificado.
    faceted=True → aparência de PEDRA angular: subsurf baixo + displace de ruído
    para quebrar a superfície + shade_flat (facetas duras). Use para golem de rocha."""
    obj = new_mesh_obj(name, mat)
    bm = bmesh.new()
    verts = [bm.verts.new(p) for p in points]
    bm.verts.ensure_lookup_table()
    for a, b in edges:
        bm.edges.new((verts[a], verts[b]))
    bm.to_mesh(obj.data)
    bm.free()

    obj.modifiers.new("Skin", 'SKIN')
    skin_layer = obj.data.skin_vertices[0].data
    if isinstance(radii, (int, float)):
        radii = [radii] * len(points)
    for i, r in enumerate(radii):
        skin_layer[i].radius = (r, r)
    skin_layer[root_index].use_root = True

    if subsurf:
        sub = obj.modifiers.new("Subsurf", 'SUBSURF')
        sub.levels = subsurf; sub.render_levels = subsurf

    if faceted:
        # Voronoi cria placas de rocha; strength alto = relevo forte de pedra rachada
        tex = bpy.data.textures.new(name + "_rock", 'VORONOI')
        tex.noise_scale = 0.35
        tex.distance_metric = 'DISTANCE_SQUARED'
        disp = obj.modifiers.new("Rock", 'DISPLACE')
        disp.texture = tex; disp.strength = 0.22; disp.mid_level = 0.45
        # segundo displace com ruído fino para micro-quebras
        tex2 = bpy.data.textures.new(name + "_rock2", 'MUSGRAVE') if 'MUSGRAVE' in \
            [e.identifier for e in bpy.types.Texture.bl_rna.properties['type'].enum_items] else None
        # Decimate planar agressivo → facetas grandes low-poly (placas de pedra)
        dec = obj.modifiers.new("Planar", 'DECIMATE')
        dec.decimate_type = 'DISSOLVE'; dec.angle_limit = math.radians(18)

    set_active(obj)
    if smooth and not faceted:
        bpy.ops.object.shade_smooth()
    else:
        bpy.ops.object.shade_flat()
    return obj


def ico(name, radius, location, mat, subdiv=1, flat=False, scale=(1, 1, 1), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=radius, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = rot
    if mat:
        obj.data.materials.append(mat)
    if flat:
        bpy.ops.object.shade_flat()
    else:
        bpy.ops.object.shade_smooth()
    return obj


def cone(name, r1, r2, depth, location, mat, verts=8, rot=(0, 0, 0), flat=True):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=location)
    obj = bpy.context.active_object
    obj.name = name; obj.rotation_euler = rot
    if mat:
        obj.data.materials.append(mat)
    bpy.ops.object.shade_flat() if flat else bpy.ops.object.shade_smooth()
    return obj


def cylinder(name, radius, depth, location, mat, verts=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=location)
    obj = bpy.context.active_object
    obj.name = name; obj.rotation_euler = rot
    if mat:
        obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def torus(name, major, minor, location, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=location)
    obj = bpy.context.active_object
    obj.name = name; obj.rotation_euler = rot
    if mat:
        obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def crystal(name, r_base, r_top, body_h, tip_h, location, mat, sides=6, rot=(0, 0, 0),
            taper_top=0.55):
    """Prisma cristalino facetado: corpo prismático + ponta piramidal. Flat shading
    (gema lapidada). sides=6 → hexagonal; body afunila para r_top no topo antes da ponta."""
    # corpo
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=r_base, radius2=r_top,
                                    depth=body_h, location=(0, 0, body_h / 2))
    body = bpy.context.active_object
    # ponta
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=r_top * taper_top, radius2=0.0,
                                    depth=tip_h, location=(0, 0, body_h + tip_h / 2))
    tip = bpy.context.active_object
    # junta corpo + ponta
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True); tip.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = name
    body.location = location
    body.rotation_euler = rot
    if mat:
        body.data.materials.append(mat)
    bpy.ops.object.shade_flat()
    return body


def engraved_pillar(name, w, d, h, location, mat, bevel=0.04):
    """Pilar/monolito retangular com bevel (chanfro) nas arestas — base do runestone.
    Retorna o objeto; runas são adicionadas separadamente por cima."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.5))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (w, d, h)
    bpy.ops.object.transform_apply(scale=True)
    bev = obj.modifiers.new("Bevel", 'BEVEL')
    bev.width = bevel; bev.segments = 2
    obj.location = location
    if mat:
        obj.data.materials.append(mat)
    bpy.ops.object.shade_flat()
    return obj


# ─── EDITAR AQUI: construir o modelo ──────────────────────────────────────────

def build():
    """Ruby Runestone — monolito rúnico de rubi imponente emergindo de uma base de
    rocha facetada, cercado por cristais menores, com runas gravadas brilhantes e
    disco rúnico. Pedra fantástica elaborada (NÃO humanoide). Eixo Z = altura."""

    rock = make_material("Rock", "#3a2420", roughness=0.95)                 # rocha escura
    ruby = make_material("Ruby", "#c40018", roughness=0.06, transmission=0.55,
                         emission_hex="#6a0010", emission_strength=0.5)      # cristal translúcido
    glow = make_material("Glow", "#ff2440", roughness=0.25,
                         emission_hex="#ff1030", emission_strength=7.0)      # runas/energia
    disc = make_material("Disc", "#14161a", roughness=0.5, metallic=0.4)

    # ── Disco rúnico (marca da torre) — desenhado primeiro, na base ───────────
    cylinder("RockDisc", 0.82, 0.10, (0, 0, 0.05), disc, verts=64)
    torus("GlowRing", 0.64, 0.030, (0, 0, 0.11), glow)

    # ── Base de rocha facetada (montículo sobre o disco de onde o monolito nasce) ─
    BP = [(0, 0, 0.20), (0.34, 0.12, 0.28), (-0.30, -0.14, 0.30),
          (0.16, -0.34, 0.26), (-0.18, 0.34, 0.24), (0, 0, 0.50)]
    BE = [(0, 1), (0, 2), (0, 3), (0, 4), (0, 5)]
    BR = [0.40, 0.26, 0.28, 0.24, 0.24, 0.22]
    skinned_skeleton("RockBase", BP, BE, BR, rock, subsurf=2, root_index=0, faceted=True)

    # ── Monolito central de rubi — pilar hexagonal alto e imponente, quase reto ─
    crystal("RubyMonolith", r_base=0.32, r_top=0.28, body_h=1.5, tip_h=0.6,
            location=(0, 0, 0.34), mat=ruby, sides=6, rot=(0.0, 0.0, 0.1), taper_top=0.5)

    # ── Runas gravadas na face frontal do monolito (inscrição vertical) ───────
    rune_zs = [0.78, 1.06, 1.34, 1.60]
    for i, z in enumerate(rune_zs):
        sc = 0.9 - i * 0.1
        ico(f"GlowRune_{i}", 0.08 * sc, (0.0, 0.30, z), glow, subdiv=1, flat=True,
            scale=(1.1, 0.3, 1.5))
    # núcleo pulsante maior no centro
    ico("GemCore", 0.16, (0.0, 0.31, 1.16), glow, subdiv=1, flat=True, scale=(1.0, 0.4, 1.3))

    # ── Cristais satélites brotando da base ao redor do monolito ──────────────
    sats = [
        (0.44, 0.12, 0.34, 0.13, 0.60, 0.26, (0.35, 0.2, 0.0)),
        (-0.42, -0.08, 0.32, 0.11, 0.48, 0.22, (0.35, -0.3, -0.2)),
        (0.18, -0.44, 0.30, 0.10, 0.42, 0.20, (0.45, 0.0, 0.4)),
        (-0.22, 0.42, 0.34, 0.12, 0.54, 0.24, (0.35, 0.4, -0.3)),
        (0.36, -0.32, 0.28, 0.085, 0.34, 0.16, (0.5, 0.0, 0.6)),
        (-0.36, 0.30, 0.28, 0.09, 0.38, 0.18, (0.5, -0.4, -0.5)),
    ]
    for i, (x, y, z, rb, bh, th, rot) in enumerate(sats):
        crystal(f"RubySat_{i}", r_base=rb, r_top=rb * 0.6, body_h=bh, tip_h=th,
                location=(x, y, z), mat=ruby, sides=6, rot=rot)

    # ── Lascas de rubi flutuantes (animadas no runtime — orbitam) ─────────────
    for i, (x, y, z) in enumerate([(0.55, 0.0, 1.55), (-0.5, 0.2, 1.75), (0.2, -0.5, 1.95)]):
        ico(f"FloatShard_{i}", 0.07, (x, y, z), ruby, subdiv=1, flat=True,
            scale=(0.7, 0.7, 1.4), rot=(0.3 * i, 0.5 * i, 0))


# ─── Pós-processo + export ────────────────────────────────────────────────────

def drop_to_floor():
    """Assenta o ponto mais baixo (considerando modifiers aplicados) em Z=0."""
    dg = bpy.context.evaluated_depsgraph_get()
    min_z = 1e9
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        ev = obj.evaluated_get(dg)
        for v in ev.data.vertices:
            wz = (obj.matrix_world @ v.co).z
            if wz < min_z:
                min_z = wz
    for obj in bpy.context.scene.objects:
        if obj.parent is None:
            obj.location.z -= min_z


def sync_mesh_names():
    """Copia o nome do objeto para o mesh-data. O glTF exporter nomeia o mesh pelo
    mesh-data; sem isso o R3F acha 'Torus'/'Icosphere' em vez de 'GlowRing'/'RockBody'
    e o matching de material por nome falha."""
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH' and obj.data is not None:
            obj.data.name = obj.name


def export_glb(path):
    sync_mesh_names()
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_apply=True,     # aplica skin/subsurf/decimate — ESSENCIAL
        export_yup=True,       # Y-up (convenção three.js/R3F)
        use_selection=False,
    )


def render_preview(path):
    scn = bpy.context.scene
    # Nome do engine varia por versão do Blender (5.x: BLENDER_EEVEE)
    engines = scn.render.bl_rna.properties['engine'].enum_items.keys()
    scn.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else (
        'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_WORKBENCH')
    scn.render.resolution_x = 800
    scn.render.resolution_y = 800
    scn.render.film_transparent = False
    # Câmera
    cam_data = bpy.data.cameras.new("Cam")
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    # Aponta a câmera para o centro do modelo (usa um empty como alvo)
    target = bpy.data.objects.new("CamTarget", None)
    target.location = (0, 0, 1.15)
    bpy.context.collection.objects.link(target)
    cam.location = (2.6, 4.8, 2.6)   # frente do modelo (+Y = face)
    cam_data.lens = 50
    tc = cam.constraints.new('TRACK_TO')
    tc.target = target
    tc.track_axis = 'TRACK_NEGATIVE_Z'
    tc.up_axis = 'UP_Y'
    scn.camera = cam
    # Luz
    light_data = bpy.data.lights.new("Sun", 'SUN')
    light_data.energy = 4.0
    light = bpy.data.objects.new("Sun", light_data)
    light.rotation_euler = (0.6, 0.2, -0.5)
    bpy.context.collection.objects.link(light)
    # Fundo claro
    world = bpy.data.worlds.new("W"); world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.85, 0.85, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    scn.world = world
    import os
    scn.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "model.glb"
    want_preview = "--preview" in sys.argv
    reset_scene()
    build()
    drop_to_floor()
    export_glb(out)
    print(f"saved {out}")
    if want_preview:
        png = out.rsplit(".", 1)[0] + "_preview.png"
        render_preview(png)
        print(f"preview {png}")


if __name__ == "__main__":
    main()
