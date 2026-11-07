import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundY } from './world.js';

// ---------------------------------------------------------------------------
// Twigs scattered in the dark. Picking one hides it; it regrows somewhere
// else after a while. A larger invisible hit sphere makes them easy to tap.
// ---------------------------------------------------------------------------

import { TWIGS, twigSpot } from '../shared/rules.js';
export { TWIGS };

export function twigGeometry() {
  const main = new THREE.CylinderGeometry(0.018, 0.026, 0.62, 5);
  main.rotateZ(Math.PI / 2);
  const fork = new THREE.CylinderGeometry(0.01, 0.016, 0.22, 4);
  fork.translate(0, 0.11, 0); fork.rotateZ(-0.9); fork.translate(0.08, 0, 0);
  const fork2 = new THREE.CylinderGeometry(0.008, 0.013, 0.16, 4);
  fork2.translate(0, 0.08, 0); fork2.rotateZ(1.0); fork2.rotateY(0.6); fork2.translate(-0.14, 0, 0.01);
  const g = mergeGeometries([main.toNonIndexed(), fork.toNonIndexed(), fork2.toNonIndexed()]);
  g.translate(0, 0.025, 0);
  return g;
}

export class Twigs {
  constructor(scene, blocked = () => false) {
    this.blocked = blocked;
    this.geo = twigGeometry();
    this.mat = new THREE.MeshLambertMaterial({ color: 0x9c7a55 });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, TWIGS.count);
    this.hits = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 6, 4), new THREE.MeshBasicMaterial({ visible: false }), TWIGS.count);
    this.items = [];
    for (let i = 0; i < TWIGS.count; i++) {
      this.items.push({ id: i, x: 0, z: 0, yaw: 0, present: true, regrowAt: 0, gen: 0 });
      this.scatter(i);
    }
    scene.add(this.mesh, this.hits);
    this.time = 0;
  }

  /** Lay twig i at its spot for its current life. Same spot for every player. */
  scatter(i) {
    const it = this.items[i];
    // Same spot for every player and the server (no local checks, so everyone agrees)
    Object.assign(it, twigSpot(i, it.gen));
    it.present = true;
    this.write(i);
  }

  /** The server says twig i grew back (multiplayer). */
  respawn(i, gen) {
    const it = this.items[i];
    if (!it) return;
    it.gen = gen;
    this.scatter(i);
  }

  /** Someone else picked twig i up (multiplayer). */
  hide(i) {
    const it = this.items[i];
    if (!it || !it.present) return;
    it.present = false;
    this.write(i);
  }

  write(i) {
    const it = this.items[i];
    const m = new THREE.Matrix4();
    const s = it.present ? 1 : 0;
    m.compose(new THREE.Vector3(it.x, groundY(it.x, it.z), it.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, it.yaw, 0)), new THREE.Vector3(s, s, s));
    this.mesh.setMatrixAt(i, m);
    this.hits.setMatrixAt(i, m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.hits.instanceMatrix.needsUpdate = true;
  }

  take(i) {
    const it = this.items[i];
    if (!it || !it.present) return false;
    it.present = false;
    it.regrowAt = this.time + TWIGS.regrowMin + Math.random() * (TWIGS.regrowMax - TWIGS.regrowMin);
    this.write(i);
    this.onTake?.(i);
    return true;
  }

  nearest(x, z) {
    let best = null, bd = Infinity;
    for (const it of this.items) {
      if (!it.present) continue;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  update(dt) {
    this.time += dt;
    if (this.networked) return; // the server decides when twigs grow back
    for (const it of this.items) if (!it.present && this.time >= it.regrowAt) { it.gen++; this.scatter(it.id); }
  }
}
