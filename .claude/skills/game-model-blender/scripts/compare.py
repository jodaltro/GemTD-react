"""compare.py — mecanismo de verificação visual contra uma referência.

Renderiza o GLB de VÁRIOS ângulos (frente, 3/4, lado) via Blender headless e monta
um contact sheet lado a lado com a imagem de referência. Assim cada iteração é
comparada de forma consistente — sem "achar que está bom" olhando um ângulo só.

Uso (da raiz do projeto):
    py -3.13 .claude/skills/game-model-blender/scripts/compare.py \
        public/glb/ruby.glb .claude/skills/game-model-blender/reference/ruby_sentinel_ref.jpg \
        <saida.png>

O ângulo 3/4 imita o enquadramento isométrico da arte de referência dos jogos.
"""

import sys, os, math
import bpy
from PIL import Image

TILE = 512  # resolução de cada render


def import_glb(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))


def setup_world_and_light():
    scn = bpy.context.scene
    engines = scn.render.bl_rna.properties['engine'].enum_items.keys()
    scn.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else (
        'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_WORKBENCH')
    scn.render.resolution_x = TILE
    scn.render.resolution_y = TILE
    scn.render.film_transparent = False
    # key + fill lights
    for name, rot, energy in [("Key", (0.7, 0.1, -0.5), 4.0), ("Fill", (0.9, -0.3, 2.2), 1.5)]:
        ld = bpy.data.lights.new(name, 'SUN'); ld.energy = energy
        lo = bpy.data.objects.new(name, ld); lo.rotation_euler = rot
        bpy.context.collection.objects.link(lo)
    world = bpy.data.worlds.new("W"); world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.82, 0.82, 0.84, 1); bg.inputs[1].default_value = 1.0
    scn.world = world


def model_center_height():
    mn = [1e9] * 3; mx = [-1e9] * 3
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            for i in range(3):
                mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
    cz = (mn[2] + mx[2]) / 2
    h = mx[2] - mn[2]
    return cz, h


def render_angle(out_png, az_deg, cz, h):
    """Renderiza o modelo de um azimute. az=0 → frente (câmera em -Y).
    Usa rotação direta (não TRACK_TO, que não avalia antes do render headless)."""
    scn = bpy.context.scene
    for o in list(scn.objects):
        if o.type == 'CAMERA':
            bpy.data.objects.remove(o, do_unlink=True)
    cam_data = bpy.data.cameras.new("Cam"); cam_data.lens = 45
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)

    from mathutils import Vector, Euler
    dist = h * 1.35
    az = math.radians(az_deg)
    # posição orbitando o centro (0,0,cz). A FRENTE do modelo aponta +Y no Blender,
    # então az=0 coloca a câmera em +Y (olhando a face).
    cam.location = Vector((math.sin(az) * dist, math.cos(az) * dist, cz + h * 0.20))
    # aponta manualmente para o centro: direção câmera→alvo
    target = Vector((0, 0, cz))
    direction = (cam.location - target)
    # rotação que olha ao longo de -Z para o alvo, com +Y up
    rot_quat = direction.to_track_quat('Z', 'Y')
    cam.rotation_euler = rot_quat.to_euler()
    scn.camera = cam
    bpy.context.view_layer.update()
    scn.render.filepath = os.path.abspath(out_png)
    bpy.ops.render.render(write_still=True)


def main():
    glb = sys.argv[1]
    ref = sys.argv[2]
    out = sys.argv[3] if len(sys.argv) > 3 else "compare.png"

    import_glb(glb)
    setup_world_and_light()
    cz, h = model_center_height()

    tmp = os.path.abspath("_cmp_tmp")
    angles = [("front", 0), ("3q", 35), ("side", 90)]
    paths = []
    for name, az in angles:
        p = f"{tmp}_{name}.png"
        render_angle(p, az, cz, h)
        paths.append(p)

    # monta contact sheet: [referência | frente | 3/4 | lado]
    ref_img = Image.open(ref).convert("RGB")
    rw = int(ref_img.width * (TILE / ref_img.height))
    ref_img = ref_img.resize((rw, TILE))
    renders = [Image.open(p).convert("RGB") for p in paths]
    total_w = rw + TILE * len(renders)
    sheet = Image.new("RGB", (total_w, TILE), (40, 40, 44))
    sheet.paste(ref_img, (0, 0))
    x = rw
    for im in renders:
        sheet.paste(im, (x, 0)); x += TILE
    sheet.save(os.path.abspath(out))
    print(f"compare sheet saved: {out}  (referência | frente | 3/4 | lado)")
    for p in paths:
        try: os.remove(p)
        except OSError: pass


if __name__ == "__main__":
    main()
