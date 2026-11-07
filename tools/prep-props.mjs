// Builds public/models/props.glb: every static prop Firelight uses, one named node each.
//   - Quaternius Stylized Nature MegaKit (CC0): trees, rocks, ferns, grass, mushrooms
//   - Quaternius Survival Pack (CC0): log seats, tent, backpack, torch, pot, axe
//   - KayKit Medieval Hexagon (CC0, Kay Lousberg): cheap far-forest silhouettes
// Usage: node tools/prep-props.mjs <megakit glTF dir> <survival OBJ dir> <kaykit nature dir>
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, mergeDocuments, unpartition, textureCompress, weld, quantize } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import obj2gltf from 'obj2gltf';
import sharp from 'sharp';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [MEGA, SURV, KAY] = process.argv.slice(2);
const MEGA_PROPS = ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5', 'CommonTree_1', 'DeadTree_1', 'DeadTree_3',
  'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3', 'Bush_Common', 'Fern_1', 'Grass_Common_Short', 'Grass_Wispy_Tall',
  'Mushroom_Common', 'Plant_1', 'Pebble_Round_1', 'Pebble_Round_3'];
const SURV_PROPS = ['WoodLog', 'Tent', 'Backpack', 'WoodenTorch', 'Pot', 'Axe', 'Radio'];
const KAY_PROPS = ['tree_single_B'];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
let doc = null;
const tmp = mkdtempSync(join(tmpdir(), 'props-'));

async function add(path, name) {
  const d = await io.read(path);
  // Drop normal maps; the game uses simple Lambert shading
  for (const m of d.getRoot().listMaterials()) { m.setNormalTexture(null); m.setMetallicFactor(0); }
  const scene = d.getRoot().listScenes()[0];
  if (!doc) {
    doc = d;
    const wrap = doc.createNode(name);
    for (const c of scene.listChildren()) { scene.removeChild(c); wrap.addChild(c); }
    scene.addChild(wrap);
    return;
  }
  const map = mergeDocuments(doc, d);
  const s = map.get(scene);
  const wrap = doc.createNode(name);
  for (const c of s.listChildren()) { s.removeChild(c); wrap.addChild(c); }
  doc.getRoot().listScenes()[0].addChild(wrap);
  s.dispose();
}

for (const p of MEGA_PROPS) await add(`${MEGA}/${p}.gltf`, p);
for (const p of KAY_PROPS) await add(`${KAY}/${p}.gltf`, p);
for (const p of SURV_PROPS) {
  const glb = await obj2gltf(`${SURV}/${p}.obj`, { binary: true });
  const f = join(tmp, `${p}.glb`);
  writeFileSync(f, glb);
  await add(f, p);
}

await doc.transform(
  unpartition(), prune(), dedup(), weld(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }),
  quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }),
);
await io.write('public/models/props.glb', doc);
console.log(doc.getRoot().listScenes()[0].listChildren().map((c) => c.getName()).join(', '));
