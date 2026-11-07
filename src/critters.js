import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { groundY, WORLD } from './world.js';

// ---------------------------------------------------------------------------
// The animals in the dark (Quaternius Ultimate Animated Animals, CC0).
// None of them can hurt you. The dark has a little bite, and the torch is
// what keeps it at bay:
//   - Wolves pace just past the firelight. Their eyes shine back at you. With
//     your torch off out in the dark they circle closer; light it and they slink off.
//   - A fox will dart in and snatch a twig if you wander the dark without your torch.
//   - A deer drifts to the edge of the light to graze when things are quiet,
//     and bolts if you come close.
//   - Fireflies drift over the ferns, brightest when the fire is low.
// ---------------------------------------------------------------------------

/** How far the fire's light reaches, in meters from the center. */
export const lightRadius = (fire) => 5 + 9 * Math.min(1, fire.size);

const KINDS = {
  wolf: { scale: 0.25, walk: 1.0, run: 5.2, idle: ['Idle', 'Idle_2_HeadLow'], eyes: 0x9fe7a8 },
  fox: { scale: 0.16, walk: 1.1, run: 5.6, idle: ['Idle', 'Idle_2_HeadLow'], eyes: 0xffd27a },
  deer: { scale: 0.4, walk: 0.9, run: 6.5, idle: ['Idle', 'Idle_Headlow', 'Eating'], eyes: null },
};

function eyeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
let eyeTex = null;

const wrapAngle = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

class Critter {
  constructor(scene, gltf, kind) {
    this.kind = kind;
    this.cfg = KINDS[kind];
    this.body = cloneSkinned(gltf.scene);
    this.body.scale.setScalar(this.cfg.scale);
    this.body.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.material = new THREE.MeshLambertMaterial({ color: o.material.color });
    });
    scene.add(this.body);
    this.mixer = new THREE.AnimationMixer(this.body);
    this.actions = Object.fromEntries(gltf.animations.map((c) => [c.name, this.mixer.clipAction(c)]));
    const hit = this.actions.Idle_HitReact1;
    if (hit) { hit.setLoop(THREE.LoopOnce, 1); hit.clampWhenFinished = true; }
    this.current = null;
    this.head = this.body.getObjectByName('Head');

    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.target = null;
    this.speed = 0;
    this.wantSpeed = 0;
    this.pause = 0;
    this.idleName = this.cfg.idle[0];
    this.state = 'roam';
    this.stateT = 0;
    this.startled = 0;

    if (this.cfg.eyes) {
      eyeTex ??= eyeTexture();
      const mat = new THREE.SpriteMaterial({ map: eyeTex, color: this.cfg.eyes, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
      this.eyes = [new THREE.Sprite(mat), new THREE.Sprite(mat)];
      this.eyeMat = mat;
      for (const e of this.eyes) { e.scale.setScalar(kind === 'wolf' ? 0.1 : 0.075); scene.add(e); }
    }
    this._v = new THREE.Vector3(); this._f = new THREE.Vector3(); this._r = new THREE.Vector3();
  }

  play(name, fade = 0.3, timeScale = 1) {
    const a = this.actions[name];
    if (!a) return;
    a.timeScale = timeScale;
    if (a === this.current) return;
    a.reset().fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = a;
  }

  startle() {
    if (this.startled > 0) return;
    this.startled = 0.6;
    this.play('Idle_HitReact1', 0.1);
  }

  goTo(x, z, speed) { this.target = { x, z }; this.wantSpeed = speed; }

  update(dt, camera) {
    this.stateT += dt;
    if (this.startled > 0) this.startled -= dt;
    if (this.target && this.startled <= 0) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.25) { this.target = null; this.wantSpeed = 0; }
      else {
        const want = Math.atan2(dx, dz);
        this.heading += wrapAngle(want - this.heading) * (1 - Math.exp(-dt * (this.speed > 3 ? 6 : 3)));
      }
    } else this.wantSpeed = 0;
    this.speed += (this.wantSpeed - this.speed) * (1 - Math.exp(-dt * 4));
    if (this.startled > 0) this.speed *= Math.exp(-dt * 10);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    const r = Math.hypot(this.pos.x, this.pos.z), maxR = 30;
    if (r > maxR) { this.pos.x *= maxR / r; this.pos.z *= maxR / r; }
    this.pos.y = groundY(this.pos.x, this.pos.z);
    this.body.position.copy(this.pos);
    this.body.rotation.y = this.heading;

    if (this.startled <= 0) {
      if (this.speed > this.cfg.walk * 1.8) this.play('Gallop', 0.25, Math.min(1.4, this.speed / this.cfg.run + 0.4));
      else if (this.speed > 0.15) this.play('Walk', 0.3, Math.max(0.6, this.speed / this.cfg.walk));
      else this.play(this.idleName, 0.5);
    }
    this.mixer.update(dt);

    // Eyeshine: two points of light that catch the fire when the animal faces you
    if (this.eyes) {
      const head = this.head.getWorldPosition(this._v);
      const fwd = this._f.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      const right = this._r.set(fwd.z, 0, -fwd.x);
      const toCam = camera.position.clone().sub(head).normalize();
      const facing = THREE.MathUtils.clamp(fwd.dot(toCam) * 1.4 + 0.1, 0, 1);
      const s = this.cfg.scale;
      for (let i = 0; i < 2; i++) {
        this.eyes[i].position.copy(head).addScaledVector(fwd, 0.55 * s).addScaledVector(right, (i ? 0.17 : -0.17) * s).add(new THREE.Vector3(0, 0.12 * s, 0));
      }
      this.eyeMat.opacity = facing * this.eyeGlow;
    }
  }
}

export class Critters {
  constructor(scene, models, { fire, camper, sound }) {
    Object.assign(this, { fire, camper, sound });
    this.wolves = [0, 1].map(() => new Critter(scene, models.wolf, 'wolf'));
    this.fox = new Critter(scene, models.fox, 'fox');
    this.deer = new Critter(scene, models.deer, 'deer');
    const place = (c, a, r) => { c.pos.set(Math.cos(a) * r, 0, Math.sin(a) * r); c.heading = a + Math.PI / 2; };
    this.wolves.forEach((w, i) => { place(w, i * 3.1 + 0.6, 16); w.angle = i * 3.1 + 0.6; w.dir = i ? -1 : 1; });
    place(this.fox, 4.2, 16); this.fox.angle = 4.2;
    place(this.deer, 1.9, 26); this.deer.state = 'away'; this.deer.stateT = 0; this.deer.waitFor = 25;
    this.darkTime = 0;
    this.foxCooldown = 20;
    this.howlIn = 40 + Math.random() * 40;

    // Fireflies
    const N = 70, p = new Float32Array(N * 3), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = 6.5 + Math.random() * 12;
      p[i * 3] = Math.cos(a) * r; p[i * 3 + 1] = 0.3 + Math.random() * 1.4; p[i * 3 + 2] = Math.sin(a) * r;
      ph[i] = Math.random() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    this.flyU = { uTime: { value: 0 }, uBright: { value: 1 }, uPx: { value: 1 } };
    this.flies = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.flyU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aPh; uniform float uTime, uPx; varying float vA;
        void main(){ vec3 q = position + vec3(sin(uTime*0.3+aPh)*0.6, sin(uTime*0.5+aPh*1.7)*0.25, cos(uTime*0.27+aPh*0.7)*0.6);
          float blink = pow(max(0.0, sin(uTime*(0.6+fract(aPh)*0.5) + aPh)), 6.0);
          vA = blink; vec4 mv = modelViewMatrix * vec4(q, 1.0);
          gl_PointSize = clamp(60.0 * uPx / -mv.z, 1.5, 9.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uBright; varying float vA; void main(){ vec2 d = gl_PointCoord*2.0-1.0; float a = 1.0 - smoothstep(0.0, 1.0, length(d));
          gl_FragColor = vec4(vec3(0.85, 1.0, 0.45), a * a * vA * uBright); }`,
    }));
    this.flies.frustumCulled = false;
    scene.add(this.flies);
  }

  update(dt, camera) {
    const me = this.camper, fire = this.fire;
    const light = lightRadius(fire);
    const myR = Math.hypot(me.pos.x, me.pos.z);
    const inDark = myR > light + 0.5;
    this.darkTime = inDark && !me.torch ? this.darkTime + dt : 0;
    this.foxCooldown -= dt;

    // ---- wolves ----
    for (const w of this.wolves) {
      const d = w.pos.distanceTo(me.pos);
      w.eyeGlow = 0.95;
      if (me.torch && d < 7 && w.state !== 'flee') { w.state = 'flee'; w.stateT = 0; if (d < 4) w.startle(); }
      if (w.state === 'flee') {
        const away = Math.atan2(w.pos.x - me.pos.x, w.pos.z - me.pos.z);
        w.goTo(w.pos.x + Math.sin(away) * 6, w.pos.z + Math.cos(away) * 6, w.cfg.run * 0.8);
        if (d > 11 || w.stateT > 5) { w.state = 'roam'; w.stateT = 0; w.angle = Math.atan2(w.pos.z, w.pos.x); }
      } else if (this.darkTime > 2 && d < 16 && w === this.nearestWolf(me)) {
        // Stalk: circle you at a wary distance, on the forest side
        w.state = 'stalk';
        w.orbit = (w.orbit ?? Math.atan2(w.pos.z - me.pos.z, w.pos.x - me.pos.x)) + dt * 0.25 * w.dir;
        const R = 3.4;
        w.goTo(me.pos.x + Math.cos(w.orbit) * R, me.pos.z + Math.sin(w.orbit) * R, w.cfg.walk * 1.2);
      } else {
        if (w.state === 'stalk') { w.state = 'roam'; w.orbit = null; w.angle = Math.atan2(w.pos.z, w.pos.x); }
        // Pace the edge of the light, pausing now and then
        if (w.pause > 0) { w.pause -= dt; w.wantSpeed = 0; w.target = null; }
        else {
          w.angle += dt * 0.07 * w.dir;
          const R = Math.max(9, light + 2.5) + Math.sin(w.angle * 3) * 1.2;
          w.goTo(Math.cos(w.angle) * R, Math.sin(w.angle) * R, w.cfg.walk);
          if (Math.random() < dt * 0.06) { w.pause = 2 + Math.random() * 5; w.idleName = w.cfg.idle[Math.floor(Math.random() * 2)]; }
        }
      }
      // Wolves keep out of the firelight's heart and the seat ring
      const r = Math.hypot(w.pos.x, w.pos.z), minR = Math.max(6.5, light - 1);
      if (r < minR && w.state !== 'stalk') { w.pos.x *= minR / r; w.pos.z *= minR / r; }
      w.update(dt, camera);
    }
    this.howlIn -= dt;
    if (this.howlIn <= 0) { this.sound?.howl?.(this.wolves[0].pos); this.howlIn = 70 + Math.random() * 90 + fire.size * 60; }

    // ---- fox ----
    const f = this.fox;
    const fd = f.pos.distanceTo(me.pos);
    f.eyeGlow = 0.9;
    if (f.state === 'approach') {
      if (me.torch || me.carrying === 0 || !inDark) { f.state = 'flee'; f.stateT = 0; f.startle(); this.foxCooldown = 25; me.emit('foxScared'); }
      else {
        f.goTo(me.pos.x, me.pos.z, f.cfg.run);
        if (fd < 0.9) {
          me.carrying--; me.avatar.setCarrying(me.carrying);
          me.emit('foxStole');
          this.sound?.yip?.(f.pos);
          f.state = 'flee'; f.stateT = 0; this.foxCooldown = 50;
        }
      }
    } else if (f.state === 'flee') {
      const away = Math.atan2(f.pos.x, f.pos.z);
      f.goTo(Math.sin(away) * 24, Math.cos(away) * 24, f.cfg.run);
      if (f.stateT > 4) { f.state = 'roam'; f.stateT = 0; f.angle = away; }
    } else {
      if (this.darkTime > 3.5 && me.carrying > 0 && this.foxCooldown <= 0 && fd < 14) { f.state = 'approach'; f.stateT = 0; }
      else if (f.pause > 0) { f.pause -= dt; f.target = null; }
      else {
        f.angle += dt * 0.05;
        const R = 14 + Math.sin(f.angle * 2) * 2.5;
        f.goTo(Math.cos(f.angle) * R, Math.sin(f.angle) * R, f.cfg.walk);
        if (Math.random() < dt * 0.08) { f.pause = 3 + Math.random() * 6; f.idleName = f.cfg.idle[Math.floor(Math.random() * 2)]; }
      }
    }
    f.update(dt, camera);

    // ---- deer ----
    const dr = this.deer;
    const dd = dr.pos.distanceTo(me.pos);
    const spook = dd < 6.5 || (dd < 11 && me.speed > 3) || (me.torch && dd < 8);
    if (dr.state === 'away') {
      if (Math.hypot(dr.pos.x, dr.pos.z) < 22) { const a = Math.atan2(dr.pos.z, dr.pos.x); dr.goTo(Math.cos(a) * 25, Math.sin(a) * 25, dr.cfg.walk); }
      if (dr.stateT > dr.waitFor && fire.size < 0.75) {
        // Come in on the far side from you
        dr.angle = Math.atan2(-me.pos.z, -me.pos.x) + (Math.random() - 0.5) * 1.2;
        dr.state = 'approach'; dr.stateT = 0;
      }
    } else if (dr.state === 'approach' || dr.state === 'graze') {
      const R = Math.max(7.5, light + 1.5);
      if (spook) {
        dr.startle(); dr.state = 'flee'; dr.stateT = 0;
      } else if (dr.state === 'approach') {
        // Circle around through the woods first, then step in toward the light
        const at = Math.atan2(dr.pos.z, dr.pos.x), diff = wrapAngle(dr.angle - at);
        if (Math.abs(diff) > 0.25) {
          const a = at + Math.sign(diff) * Math.min(Math.abs(diff), 0.5), r = Math.max(18, Math.hypot(dr.pos.x, dr.pos.z));
          dr.goTo(Math.cos(a) * r, Math.sin(a) * r, dr.cfg.walk * 2.2);
        } else {
          dr.goTo(Math.cos(dr.angle) * R, Math.sin(dr.angle) * R, dr.cfg.walk);
          if (Math.hypot(dr.pos.x, dr.pos.z) < R + 0.4) { dr.target = null; dr.state = 'graze'; dr.stateT = 0; dr.heading = Math.atan2(-dr.pos.x, -dr.pos.z) + (Math.random() - 0.5); }
        }
      } else {
        if (dr.stateT > 6 + Math.random() * 6) { dr.stateT = 0; dr.idleName = dr.cfg.idle[Math.floor(Math.random() * 3)]; }
        if (dr.stateT === 0 && Math.random() < 0.3) dr.goTo(dr.pos.x + (Math.random() - 0.5) * 2, dr.pos.z + (Math.random() - 0.5) * 2, dr.cfg.walk * 0.6);
        if (fire.size > 0.85) { dr.state = 'away'; dr.stateT = 0; dr.waitFor = 40; } // a roaring bonfire is too much
      }
    } else if (dr.state === 'flee') {
      const away = Math.atan2(dr.pos.x - me.pos.x, dr.pos.z - me.pos.z);
      dr.goTo(dr.pos.x + Math.sin(away) * 8, dr.pos.z + Math.cos(away) * 8, dr.cfg.run);
      if (dr.stateT > 3.5) { dr.state = 'away'; dr.stateT = 0; dr.waitFor = 40 + Math.random() * 60; dr.angle = Math.atan2(dr.pos.z, dr.pos.x); }
    }
    dr.update(dt, camera);

    // ---- fireflies ----
    this.flyU.uTime.value += dt;
    this.flyU.uBright.value = 1.1 - Math.min(1, fire.size) * 0.75;
  }

  nearestWolf(me) {
    return this.wolves.reduce((a, b) => (a.pos.distanceTo(me.pos) < b.pos.distanceTo(me.pos) ? a : b));
  }
}
