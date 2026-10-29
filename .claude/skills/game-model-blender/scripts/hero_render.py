"""hero_render.py — gera uma imagem "concept art" do GLB com iluminação dramática.
Serve como REFERÊNCIA-alvo estilizada (fundo escuro, rim light vermelho, glow forte).

Uso: py -3.13 .../hero_render.py public/glb/ruby.glb <saida.png>
"""
import sys, os, math
import bpy
from mathutils import Vector

glb = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else "hero.png"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(glb))

scn = bpy.context.scene
engines = scn.render.bl_rna.properties['engine'].enum_items.keys()
scn.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else (
    'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_WORKBENCH')
# bloom se disponível (Eevee legacy)
try:
    scn.eevee.use_bloom = True
    scn.eevee.bloom_intensity = 0.08
except Exception:
    pass
scn.render.resolution_x = 768
scn.render.resolution_y = 768

# centro/altura
mn = [1e9]*3; mx = [-1e9]*3
for o in scn.objects:
    if o.type == 'MESH':
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            for i in range(3):
                mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
cz = (mn[2]+mx[2])/2; h = mx[2]-mn[2]

# fundo escuro dramático
world = bpy.data.worlds.new("W"); world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.02, 0.02, 0.03, 1); bg.inputs[1].default_value = 1.0
scn.world = world

# key light frontal-cima quente + rim light vermelho atrás + fill frio fraco
def add_light(name, kind, loc, rot, energy, color, size=2.0):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy; ld.color = color
    if kind == 'AREA': ld.size = size
    lo = bpy.data.objects.new(name, ld); lo.location = loc; lo.rotation_euler = rot
    scn.collection.objects.link(lo)

add_light("Key", 'AREA', (2.2, -2.6, cz+h*0.9), (0.9, 0.3, 0.7), 800, (1.0, 0.95, 0.9), 3)
add_light("Rim", 'AREA', (-1.8, 2.4, cz+h*0.6), (1.2, -0.3, -2.4), 900, (1.0, 0.1, 0.2), 3)
add_light("Fill", 'AREA', (-2.4, -1.6, cz+h*0.3), (1.3, -0.2, -0.9), 200, (0.4, 0.5, 0.9), 3)

# câmera 3/4 herói
cam_data = bpy.data.cameras.new("C"); cam_data.lens = 55
cam = bpy.data.objects.new("C", cam_data); scn.collection.objects.link(cam)
az = math.radians(28)
dist = h * 1.5
cam.location = Vector((math.sin(az)*dist, math.cos(az)*dist, cz+h*0.22))
direction = cam.location - Vector((0, 0, cz))
cam.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
scn.camera = cam
bpy.context.view_layer.update()

scn.render.filepath = os.path.abspath(out)
bpy.ops.render.render(write_still=True)
print(f"hero render saved: {out}")
