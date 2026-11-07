import * as THREE from 'three';
import { Flames } from './fire.js';

// ---------------------------------------------------------------------------
// Marshmallows. They're hidden in small crates out in the dark (James's idea).
// Put one on a twig, hold it toward the fire, and it toasts: white, golden,
// toasty brown, charred... or it catches fire. Closer to the flames roasts
// faster and burns sooner. The stick can go on the fire afterward.
//
// The roast itself lives on the Camper (camper.stick), so in Phase 2 it can
// travel over the network, and a toasted marshmallow can be handed to a friend.
// ---------------------------------------------------------------------------

export const MALLOW = {
  stickLength: 1.55,
  heatReach: 2.7,   // tip closer than this to the fire's center starts toasting
  rate: 0.11,       // doneness per second at full heat
  catchAt: 0.93,    // past this, strong heat can set it alight
  fallsAt: 1.35,    // a burning marshmallow drops off the stick here
};

/** What a doneness reads as, from raw to charcoal. */
export function roastLabel(m) {
  if (!m) return 'Empty stick';
  if (m.burning) return 'On fire! Blow it out';
  const d = m.doneness;
  if (d < 0.18) return 'Raw';
  if (d < 0.4) return 'Warming up';
  if (d < 0.62) return 'Golden';
  if (d < 0.8) return 'Toasty brown';
  if (d < 1.0) return 'Charred';
  return 'Burnt to a crisp';
}

export function eatLine(m) {
  const d = m.doneness;
  if (d < 0.18) return 'Cold and squishy. Hold it a little closer next time.';
  if (d < 0.4) return 'Warm and gooey in the middle.';
  if (d < 0.62) return 'Perfect. Golden all the way around.';
  if (d < 0.8) return 'Toasty and caramelized. A classic.';
  if (d < 1.0) return 'Crunchy and smoky. Some folks like it this way.';
  return 'Mostly charcoal. Brave.';
}

const RAW = new THREE.Color(1.0, 0.97, 0.92), GOLD = new THREE.Color(0.96, 0.7, 0.32),
  BROWN = new THREE.Color(0.5, 0.27, 0.11), CHAR = new THREE.Color(0.06, 0.05, 0.05);
export function roastColor(d, out = new THREE.Color()) {
  if (d < 0.5) return out.copy(RAW).lerp(GOLD, THREE.MathUtils.smoothstep(d, 0.12, 0.5));
  if (d < 0.78) return out.copy(GOLD).lerp(BROWN, (d - 0.5) / 0.28);
  return out.copy(BROWN).lerp(CHAR, THREE.MathUtils.clamp((d - 0.78) / 0.3, 0, 1));
}

import { CRATES, crateSpot } from '../shared/rules.js';
export { CRATES };

/** Small wooden crates of marshmallows hidden in the dark. Open one, take what's inside; it refills later. */
export class Crates {
  constructor(scene, colliders, blocked) {
    this.items = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    const wood = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
    const dark = new THREE.MeshLambertMaterial({ color: 0x4a3420 });
    const inside = new THREE.MeshLambertMaterial({ color: 0x1a120a });
    const paint = new THREE.MeshLambertMaterial({ color: 0xd8d2c4 });
    const white = new THREE.MeshLambertMaterial({ color: 0xf6f1e8 });
    const mallowGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.045, 10);

    // Spots come from the shared rules, so the server (and AI partners) know them too.
    // The forest leaves room for them, so they sit tucked among the trees.
    for (let i = 0; i < CRATES.count; i++) {
      const { x, z, yaw } = crateSpot(i);
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = yaw;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.32), wood);
      body.position.y = 0.13;
      g.add(body);
      for (const y of [0.05, 0.21]) for (const zz of [-0.161, 0.161]) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.035, 0.01), dark);
        slat.position.set(0, y, zz); g.add(slat);
      }
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), inside);
      hole.rotation.x = -Math.PI / 2; hole.position.y = 0.262; g.add(hole);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.08), paint);
      label.position.set(0, 0.14, 0.162); g.add(label);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.022, 10), new THREE.MeshLambertMaterial({ color: 0x2f5fa8 }));
      dot.position.set(-0.06, 0.14, 0.163); g.add(dot);
      // Marshmallows inside, visible when the lid is open
      const stash = new THREE.Group();
      for (let k = 0; k < 5; k++) {
        const m = new THREE.Mesh(mallowGeo, white);
        m.position.set((k - 2) * 0.07, 0.25, ((k % 2) - 0.5) * 0.08); m.rotation.set(Math.PI / 2, k, 0);
        stash.add(m);
      }
      g.add(stash);
      const hinge = new THREE.Group();
      hinge.position.set(0, 0.26, -0.16);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 0.34), wood);
      lid.position.set(0, 0.0175, 0.16);
      hinge.add(lid);
      g.add(hinge);
      g.traverse((o) => { if (o.isMesh) o.userData.crate = i; });
      this.group.add(g);
      this.items.push({ id: i, x, z, full: true, refillAt: 0, open: 0, mesh: g, hinge, stash });
    }
    this.time = 0;
  }

  /** Take what's in a crate. Returns how many marshmallows were inside. */
  take(id) {
    const it = this.items[id];
    if (!it || !it.full) return 0;
    it.full = false;
    this.onTake?.(id);
    it.refillAt = this.time + CRATES.refillMin + Math.random() * (CRATES.refillMax - CRATES.refillMin);
    return CRATES.give[0] + Math.floor(Math.random() * (CRATES.give[1] - CRATES.give[0] + 1));
  }

  /** Someone else emptied crate id (multiplayer). */
  markEmpty(id) { const it = this.items[id]; if (it) it.full = false; }
  /** The server restocked crate id (multiplayer). */
  refill(id) { const it = this.items[id]; if (it) it.full = true; }

  update(dt) {
    this.time += dt;
    for (const it of this.items) {
      if (!this.networked && !it.full && this.time >= it.refillAt) it.full = true;
      // The lid stands open while a crate is empty, and closes again when it refills
      const want = it.full ? 0 : 1;
      it.open += (want - it.open) * (1 - Math.exp(-dt * 5));
      it.hinge.rotation.x = -it.open * 1.9;
      it.stash.visible = it.full;
    }
  }
}

/** The stick in your hand and the marshmallow on its end. Drives the roast. */
export class Roaster {
  constructor(scene, camper, fire, { remote = false } = {}) {
    this.remote = remote; // someone else's stick: show it, their browser does the roasting
    this.camper = camper;
    this.fire = fire;
    this.group = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.011, MALLOW.stickLength, 5), new THREE.MeshLambertMaterial({ color: 0x8a6a48 }));
    stick.rotation.x = Math.PI / 2;
    stick.position.z = MALLOW.stickLength / 2;
    this.group.add(stick);
    this.mallowMat = new THREE.MeshLambertMaterial({ color: RAW.clone(), emissive: 0xff6a20, emissiveIntensity: 0 });
    this.mallow = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.045, 12), this.mallowMat);
    this.mallow.rotation.x = Math.PI / 2;
    this.mallow.position.z = MALLOW.stickLength - 0.035;
    this.group.add(this.mallow);
    this.group.visible = false;
    scene.add(this.group);

    this.flames = new Flames(14);
    this.flames.mesh.visible = false;
    scene.add(this.flames.mesh);

    this.tip = new THREE.Vector3();
    this._hand = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    const c = this.camper;
    const has = !!c.stick;
    this.group.visible = has;
    c.avatar.bundle.visible = !has && c.carrying > 0; // the stick takes the twig hand
    if (!has) { this.flames.mesh.visible = false; return; }

    // Point the stick from the hand toward the fire, drooping a little
    const hand = c.avatar.handPosition(this._hand);
    const aim = this._aim.set(0, 0.55 + this.fire.size * 0.3, 0);
    const dist = Math.hypot(hand.x, hand.z);
    if (dist > MALLOW.stickLength + 2.2) {
      // Far from the fire: carry it upright over the shoulder
      aim.set(hand.x + Math.sin(c.heading) * 0.4, hand.y + 2, hand.z + Math.cos(c.heading) * 0.4);
    }
    this.group.position.copy(hand);
    this.group.lookAt(aim);
    this.mallow.getWorldPosition(this.tip);

    const m = c.stick.mallow;
    this.mallow.visible = !!m;
    if (!m) { this.flames.mesh.visible = false; return; }

    if (this.remote) { this.paint(m); return; }
    // Heat: closer to the flames and a bigger fire both toast faster
    const d = Math.hypot(this.tip.x, this.tip.z);
    const reach = MALLOW.heatReach + this.fire.size * 0.8;
    const near = THREE.MathUtils.clamp((reach - d) / (reach - 0.4), 0, 1);
    const heat = this.fire.isEmbers ? near * 0.35 : near * near * (0.35 + this.fire.size);
    m.heat = heat;
    if (m.burning) {
      m.doneness += dt * 0.22;
      if (m.doneness >= MALLOW.fallsAt) { c.stick.mallow = null; c.emit('mallowFell'); this.fire.burst(10); }
    } else {
      m.doneness += dt * MALLOW.rate * heat;
      if (m.doneness > MALLOW.catchAt && heat > 0.35 && Math.random() < dt * heat * 1.4) { m.burning = true; c.emit('mallowCaught'); }
    }
    if (!c.stick.mallow) return;
    this.paint(m);
  }

  paint(m) {
    roastColor(m.doneness, this.mallowMat.color);
    this.mallowMat.emissiveIntensity = m.burning ? 0.9 : (m.heat ?? 0) * 0.25;
    // A marshmallow puffs up a little as it warms
    const puff = 1 + Math.min(0.25, m.doneness * 0.3);
    this.mallow.scale.set(puff, 1 + Math.min(0.15, m.doneness * 0.2), puff);

    this.flames.mesh.visible = m.burning;
    if (m.burning) {
      this.flames.mesh.position.copy(this.tip);
      this.flames.uniforms.uTime.value = this.time;
      this.flames.set(14, 0.22, 0.03, 0.14, 0.55, 2);
    }
  }
}
