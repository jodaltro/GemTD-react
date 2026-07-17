// glb-info.mjs — inspeciona um arquivo GLB sem dependências (parse do chunk JSON).
// Uso: node .claude/skills/glb-inspect/scripts/glb-info.mjs public/glb/diamond.glb [--json]

import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) { console.error('uso: node glb-info.mjs <arquivo.glb> [--json]'); process.exit(1); }
const asJson = process.argv.includes('--json');

const buf = readFileSync(path);
if (buf.readUInt32LE(0) !== 0x46546c67) { console.error('não é um GLB (magic inválido)'); process.exit(1); }
const version = buf.readUInt32LE(4);
const total = buf.readUInt32LE(8);

const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));

const acc = gltf.accessors ?? [];
const count = (i) => (i != null && acc[i] ? acc[i].count : 0);

const meshes = (gltf.meshes ?? []).map((m, i) => ({
  name: m.name ?? `mesh_${i}`,
  primitives: m.primitives.map((p) => ({
    vertices: count(p.attributes?.POSITION),
    triangles: p.indices != null ? Math.floor(count(p.indices) / 3)
                                 : Math.floor(count(p.attributes?.POSITION) / 3),
    material: p.material != null ? (gltf.materials?.[p.material]?.name ?? `material_${p.material}`) : null,
    attributes: Object.keys(p.attributes ?? {}),
  })),
}));

const info = {
  file: path,
  sizeKB: +(total / 1024).toFixed(1),
  version,
  generator: gltf.asset?.generator ?? null,
  nodes: (gltf.nodes ?? []).map((n, i) => n.name ?? `node_${i}`),
  meshes,
  totalTriangles: meshes.reduce((s, m) => s + m.primitives.reduce((a, p) => a + p.triangles, 0), 0),
  totalVertices: meshes.reduce((s, m) => s + m.primitives.reduce((a, p) => a + p.vertices, 0), 0),
  materials: (gltf.materials ?? []).map((m, i) => m.name ?? `material_${i}`),
  textures: (gltf.images ?? []).map((im, i) => im.name ?? im.uri ?? `image_${i}`),
  animations: (gltf.animations ?? []).map((a, i) => ({
    name: a.name ?? `anim_${i}`,
    channels: a.channels.length,
    durationSec: +Math.max(0, ...a.samplers.map((s) => {
      const inp = acc[s.input];
      return inp?.max?.[0] ?? 0;
    })).toFixed(2),
  })),
  skins: (gltf.skins ?? []).map((s, i) => ({ name: s.name ?? `skin_${i}`, joints: s.joints.length })),
};

if (asJson) {
  console.log(JSON.stringify(info, null, 2));
} else {
  console.log(`${info.file} — ${info.sizeKB} KB, glTF v${info.version}${info.generator ? `, gerado por ${info.generator}` : ''}`);
  console.log(`tris: ${info.totalTriangles}  verts: ${info.totalVertices}`);
  console.log(`nodes (${info.nodes.length}): ${info.nodes.join(', ') || '—'}`);
  for (const m of info.meshes)
    for (const p of m.primitives)
      console.log(`  mesh ${m.name}: ${p.triangles} tris, ${p.vertices} verts, mat=${p.material ?? '—'}, attrs=[${p.attributes.join(',')}]`);
  console.log(`materials: ${info.materials.join(', ') || '—'}`);
  console.log(`textures: ${info.textures.join(', ') || '—'}`);
  console.log(`animations: ${info.animations.map((a) => `${a.name} (${a.durationSec}s, ${a.channels}ch)`).join(', ') || '—'}`);
  console.log(`skins: ${info.skins.map((s) => `${s.name} (${s.joints} joints)`).join(', ') || '—'}`);
}
