// Prepares KayKit Adventurers (CC0, Kay Lousberg) for Firelight:
// characters without weapons or animations, plus one shared animation file.
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample, weld } from '@gltf-transform/functions';

const SRC = process.argv[2];               // .../Characters/gltf
const OUT = process.argv[3];               // public/models
const KEEP_ANIMS = ['Idle', 'Walking_A', 'Walking_Backwards', 'Running_A', 'Sit_Chair_Down', 'Sit_Chair_Idle',
  'Sit_Chair_StandUp', 'Sit_Floor_Down', 'Sit_Floor_Idle', 'Sit_Floor_StandUp', 'PickUp', 'Throw', 'Interact', 'Cheer'];
const BODY = /_(Body|Head|Head_Hooded|ArmLeft|ArmRight|LegLeft|LegRight|Cape|Hat|Helmet)$/;
const io = new NodeIO();
function dropAnimation(a) {
  for (const s of a.listSamplers()) { s.dispose(); }
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}

for (const name of ['Rogue_Hooded', 'Rogue', 'Barbarian', 'Knight', 'Mage']) {
  const doc = await io.read(`${SRC}/${name}.glb`);
  const root = doc.getRoot();
  for (const node of root.listNodes()) {
    if (node.getMesh() && !BODY.test(node.getName())) { node.getMesh().dispose(); node.dispose(); }
  }
  for (const a of root.listAnimations()) dropAnimation(a);
  await doc.transform(prune(), dedup(), weld());
  await io.write(`${OUT}/${name.toLowerCase()}.glb`, doc);
  console.log('wrote', name);
}

const doc = await io.read(`${SRC}/Rogue_Hooded.glb`);
const root = doc.getRoot();
for (const a of root.listAnimations()) if (!KEEP_ANIMS.includes(a.getName())) dropAnimation(a);
const joints = new Set(root.listSkins().flatMap(s => s.listJoints()));
for (const a of root.listAnimations()) for (const c of a.listChannels()) {
  if (!joints.has(c.getTargetNode())) { const s = c.getSampler(); c.dispose(); s.dispose(); }
}
for (const node of root.listNodes()) if (node.getMesh()) { node.getMesh().dispose(); node.setMesh(null); }
for (const s of root.listSkins()) s.dispose();
await doc.transform(resample(), prune({ keepLeaves: true }), dedup());
await io.write(`${OUT}/animations.glb`, doc);
console.log('anims', root.listAnimations().map(a => a.getName()).join(', '));
