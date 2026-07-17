// export-glb.mjs — template de geração procedural de modelos GLB via three.js em Node.
//
// Uso: copiar este arquivo para o scratchpad, editar buildModel(), e rodar:
//   node <script>.mjs <saida.glb>
//
// Regras para funcionar em Node (sem DOM):
//  - Somente geometria + materiais com cor/vertex colors — NÃO usar texturas
//    (GLTFExporter precisa de canvas para embutir imagens). Texturas são
//    aplicadas em runtime (buildGemMaterial / useTexture).
//  - Materiais: MeshStandardMaterial basta; o material real é trocado no jogo.
//  - Nomear meshes/grupos: o código R3F acha nós por nome (scene.getObjectByName).

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';

// Polyfill mínimo de FileReader (GLTFExporter usa para ler o Blob final)
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((ab) => { this.result = ab; this.onloadend?.(); this.onload?.(); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((ab) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(ab).toString('base64')}`;
      this.onloadend?.(); this.onload?.();
    });
  }
};

const OUT = process.argv[2] ?? 'model.glb';

// ─── EDITAR AQUI: construir o modelo ─────────────────────────────────────────
function buildModel() {
  const root = new THREE.Group();
  root.name = 'Model';

  // Exemplo: gema lapidada low-poly (substituir pelo modelo desejado)
  const geo = new THREE.OctahedronGeometry(0.5, 0);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x66ccff, flatShading: true });
  const gem = new THREE.Mesh(geo, mat);
  gem.name = 'Gem';
  root.add(gem);

  return root;
}
// ─────────────────────────────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.add(buildModel());

const exporter = new GLTFExporter();
exporter.parse(
  scene,
  (result) => {
    writeFileSync(OUT, Buffer.from(result));
    console.log(`saved ${OUT} (${Buffer.from(result).length} bytes)`);
  },
  (err) => { console.error('export error:', err); process.exit(1); },
  { binary: true }
);
