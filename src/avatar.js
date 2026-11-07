import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Flames } from './fire.js';
import { twigGeometry } from './twigs.js';

// ---------------------------------------------------------------------------
// The avatar's body: a KayKit Adventurers character (CC0, Kay Lousberg),
// its animations, the torch in the left hand and twigs in the right.
// It knows nothing about input. It only shows what the Camper is doing.
// ---------------------------------------------------------------------------

export const AVATAR = {
  scale: 0.8,
  looks: ['rogue_hooded', 'rogue', 'barbarian', 'knight', 'mage'],
};

const ONE_SHOTS = new Set(['Sit_Chair_Down', 'Sit_Chair_StandUp', 'PickUp', 'Throw', 'Cheer', 'Interact']);

export class Avatar {
  /** @param {THREE.Object3D} model loaded character scene  @param {THREE.AnimationClip[]} clips */
  constructor(scene, model, clips, torchModel) {
    this.root = new THREE.Group();
    this.body = cloneSkinned(model);
    this.body.scale.setScalar(AVATAR.scale);
    this.body.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        const old = o.material;
        // A touch of self-light so faces read against the fire, like light bouncing off the ground
        o.material = new THREE.MeshLambertMaterial({ map: old.map, color: old.color, emissive: 0xffffff, emissiveMap: old.map, emissiveIntensity: 0.07 });
        if (o.material.emissiveMap) o.material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
      }
    });
    this.root.add(this.body);
    scene.add(this.root);

    this.mixer = new THREE.AnimationMixer(this.body);
    this.actions = {};
    for (const c of clips) {
      const a = this.mixer.clipAction(c);
      if (ONE_SHOTS.has(c.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[c.name] = a;
    }
    this.current = null;
    this.oneShot = null;
    this.play('Idle', 0);
    this.mixer.addEventListener('finished', (e) => {
      if (this.oneShot && e.action === this.oneShot.action) {
        const done = this.oneShot.done; this.oneShot = null; done?.();
      }
    });

    // Hand slots carry props
    this.handL = this.body.getObjectByName('handslotl');
    this.handR = this.body.getObjectByName('handslotr');
    this.head = this.body.getObjectByName('head');

    // Torch: a wrapped stick; its flame and light live in world space so the
    // fire always rises upward even when the arm swings.
    const torch = new THREE.Group();
    const stick = torchModel.clone(true);
    stick.position.set(0, 0, 0); stick.rotation.set(0, 0, 0);
    stick.scale.setScalar(0.25 / AVATAR.scale);
    stick.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshLambertMaterial({ color: o.material.color }); });
    torch.add(stick);
    // A glowing wrap at the head, lit from within when the torch burns
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.14, 7), new THREE.MeshLambertMaterial({ color: 0x2a2018, emissive: 0xff6a20, emissiveIntensity: 0 }));
    wrap.position.y = 0.46 / AVATAR.scale;
    wrap.scale.setScalar(1 / AVATAR.scale);
    torch.add(wrap);
    this.torchWrap = wrap;
    this.torchTip = new THREE.Object3D();
    this.torchTip.position.y = 0.55 / AVATAR.scale;
    torch.add(this.torchTip);
    this.handL.add(torch);
    this.torch = torch;

    this.torchFlames = new Flames(28);
    this.torchFlames.set(28, 0.42, 0.06, 0.32, 0.5, 1.7);
    scene.add(this.torchFlames.mesh);
    this.torchLight = new THREE.PointLight(0xffa24a, 0, 0, 1.35);
    scene.add(this.torchLight);
    this.torchOn = false;
    this.torchLevel = 0;

    // Twig bundle in the right hand
    const tg = twigGeometry();
    const tm = new THREE.MeshLambertMaterial({ color: 0x9c7a55 });
    this.bundle = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const t = new THREE.Mesh(tg, tm);
      t.rotation.set(0, 0, Math.PI / 2 + (i - 2) * 0.12);
      t.position.set((i - 2) * 0.025, 0.05, (i % 2) * 0.03);
      t.scale.setScalar(1.6);
      this.bundle.add(t);
    }
    this.handR.add(this.bundle);
    this.setCarrying(0);
    this.time = 0;
    this._v = new THREE.Vector3();
  }

  play(name, fade = 0.25) {
    const next = this.actions[name];
    if (!next || next === this.current) return;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
  }

  /** Play a one-shot clip. `at` fires once at a fraction of the clip (for releases). */
  once(name, { at, onAt, done, fade = 0.15 } = {}) {
    const a = this.actions[name];
    if (!a) { done?.(); return; }
    if (a === this.current) {
      // Same clip again (two throws in a row): restart it, or it stays parked
      // on its last frame and never reports that it finished.
      a.reset().setEffectiveWeight(1).play();
    } else this.play(name, fade);
    // Safety net: a one-shot can never hold the body longer than its clip
    this.oneShot = { action: a, at, onAt, fired: false, done, until: this.time + a.getClip().duration + 0.6 };
  }

  get busy() { return !!this.oneShot; }

  setTorch(on) { this.torchOn = on; }
  setCarrying(n) {
    this.carrying = n;
    this.bundle.children.forEach((c, i) => { c.visible = i < n; });
  }

  /** World position of the right hand, where thrown twigs start. */
  handPosition(out = new THREE.Vector3()) { return this.handR.getWorldPosition(out); }

  update(dt, locomotion) {
    this.time += dt;
    if (!this.oneShot && locomotion) this.play(locomotion);
    this.mixer.update(dt);
    if (this.oneShot && this.time > this.oneShot.until) {
      const o = this.oneShot; this.oneShot = null;
      if (o.at != null && !o.fired) o.onAt?.();
      o.done?.();
    }
    if (this.oneShot && this.oneShot.at != null && !this.oneShot.fired) {
      const a = this.oneShot.action;
      if (a.time >= a.getClip().duration * this.oneShot.at) { this.oneShot.fired = true; this.oneShot.onAt?.(); }
    }

    // Torch flame follows the tip
    this.torchLevel += ((this.torchOn ? 1 : 0) - this.torchLevel) * (1 - Math.exp(-dt * 6));
    const tip = this.torchTip.getWorldPosition(this._v);
    this.torchFlames.mesh.position.copy(tip);
    this.torchFlames.uniforms.uTime.value = this.time;
    const lvl = this.torchLevel;
    this.torchFlames.mesh.visible = lvl > 0.02;
    this.torchFlames.set(28, 0.45 * lvl, 0.06, 0.32 * lvl, 0.5 * lvl, 1.7);
    const fl = 1 + 0.1 * Math.sin(this.time * 17) + 0.07 * Math.sin(this.time * 7.3);
    this.torchLight.position.copy(tip).y += 0.15;
    this.torchLight.intensity = 16 * lvl * fl;
    this.torchWrap.material.emissiveIntensity = 1.2 * lvl;
  }

  dispose(scene) {
    scene.remove(this.root, this.torchFlames.mesh, this.torchLight);
  }
}
