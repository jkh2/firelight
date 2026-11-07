// Prepares Quaternius Ultimate Animated Animals (CC0) for Firelight:
// keeps only the clips the game uses, drops unused data, quantizes for phones.
// Usage: node tools/prep-animals.mjs <glTF dir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, weld } from '@gltf-transform/functions';

const SRC = process.argv[2];
const KEEP = {
  Wolf: ['Idle', 'Idle_2_HeadLow', 'Walk', 'Gallop', 'Idle_HitReact1'],
  Fox: ['Idle', 'Idle_2_HeadLow', 'Walk', 'Gallop', 'Idle_HitReact1'],
  Deer: ['Idle', 'Idle_Headlow', 'Eating', 'Walk', 'Gallop', 'Idle_HitReact1'],
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const [name, keep] of Object.entries(KEEP)) {
  const doc = await io.read(`${SRC}/${name}.gltf`);
  for (const a of doc.getRoot().listAnimations()) {
    if (keep.includes(a.getName())) continue;
    for (const s of a.listSamplers()) s.dispose();
    for (const c of a.listChannels()) c.dispose();
    a.dispose();
  }
  await doc.transform(resample(), prune(), dedup(), weld(), quantize({ quantizePosition: 14, quantizeNormal: 8 }));
  await io.write(`public/models/${name.toLowerCase()}.glb`, doc);
  console.log(name, doc.getRoot().listAnimations().map((a) => a.getName()).join(', '));
}
