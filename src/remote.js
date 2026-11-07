import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { Roaster } from './marshmallow.js';
import { SIT_SINK } from './camper.js';
import { groundY } from './world.js';

// ---------------------------------------------------------------------------
// Someone else at the fire. Their browser sends where they are ten times a
// second; we show them a fraction of a second behind, smoothly in between.
// AI partners wear a small golden Bet (ב) beside their name, so everyone
// always knows who is an AI.
// ---------------------------------------------------------------------------

const DELAY = 0.15; // seconds behind real time, so movement looks smooth

function nameTag(name, ai) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = '600 30px Inter, system-ui, sans-serif';
  g.font = font;
  const mark = ai ? 'ב ' : '';
  const w = Math.ceil(g.measureText(mark + name).width) + 34;
  c.width = w; c.height = 50;
  g.font = font;
  g.fillStyle = 'rgba(14,11,9,0.62)';
  const r = 22;
  g.beginPath(); g.moveTo(r, 3); g.arcTo(w - 3, 3, w - 3, 47, r); g.arcTo(w - 3, 47, 3, 47, r); g.arcTo(3, 47, 3, 3, r); g.arcTo(3, 3, w - 3, 3, r); g.fill();
  g.textBaseline = 'middle';
  let x = 17;
  if (ai) { g.fillStyle = '#ffc24a'; g.fillText('ב', x, 26); x += g.measureText('ב ').width; }
  g.fillStyle = '#f3e6d6'; g.fillText(name, x, 26);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(w / 50 * 0.26, 0.26, 1);
  s.renderOrder = 10;
  return s;
}

/** A speech bubble: the words someone just said, floating over their head. */
export function speechBubble(text, ai) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = '500 28px Inter, system-ui, sans-serif';
  g.font = font;
  // Wrap to at most 4 lines
  const words = String(text).split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > 420 && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  if (lines.length > 4) { lines.length = 4; lines[3] = `${lines[3].slice(0, -1)}…`; }
  const w = Math.min(460, Math.max(...lines.map((l) => g.measureText(l).width))) + 40, h = lines.length * 36 + 30, tail = 16;
  c.width = Math.ceil(w); c.height = h + tail;
  g.font = font;
  g.fillStyle = ai ? 'rgba(40,30,12,0.88)' : 'rgba(250,240,226,0.94)';
  const r = 18;
  g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r);
  g.lineTo(w / 2 + 12, h); g.lineTo(w / 2, h + tail); g.lineTo(w / 2 - 12, h);
  g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.fill();
  if (ai) { g.strokeStyle = 'rgba(255,194,74,0.7)'; g.lineWidth = 2; g.stroke(); }
  g.fillStyle = ai ? '#ffe9c2' : '#2a1d12'; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, 20, 33 + i * 36));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  const scale = 0.0042;
  sp.scale.set(c.width * scale, c.height * scale, 1);
  sp.center.set(0.5, 0);
  sp.renderOrder = 12;
  sp.userData.life = 5 + Math.min(9, String(text).length / 14);
  return sp;
}

/** Shows, ages and fades one bubble per person. */
export class Bubbles {
  constructor(scene) { this.scene = scene; this.map = new Map(); }
  show(key, text, ai) {
    this.clear(key);
    const b = speechBubble(text, ai);
    this.scene.add(b);
    this.map.set(key, { b, t: 0 });
  }
  clear(key) { const e = this.map.get(key); if (e) { this.scene.remove(e.b); e.b.material.map.dispose(); e.b.material.dispose(); this.map.delete(key); } }
  update(dt, positionOf) {
    for (const [key, e] of this.map) {
      e.t += dt;
      const p = positionOf(key);
      if (!p || e.t > e.b.userData.life) { this.clear(key); continue; }
      e.b.position.set(p.x, p.y, p.z);
      e.b.material.opacity = Math.min(1, e.t * 6, (e.b.userData.life - e.t) * 1.5);
    }
  }
}

export class RemotePlayer {
  constructor(scene, info, { models, clips, torchModel, fire, seats }) {
    this.id = info.id;
    this.name = info.name;
    this.ai = !!info.ai;
    this.scene = scene;
    this.seats = seats;
    this.avatar = new Avatar(scene, models[info.look] ?? Object.values(models)[0], clips, torchModel);
    this.avatar.root.traverse((o) => { if (o.isMesh) o.userData.player = info.id; });
    this.tag = nameTag(info.name, this.ai);
    scene.add(this.tag);
    this.buffer = [];
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.sitting = false;
    this.sink = 0;
    this.carrying = 0;
    this.stick = null;
    // A stand-in the roasting-stick visuals can follow, without the roast physics
    this.roaster = new Roaster(scene, this, fire, { remote: true });
    if (info.st) this.push(info.st);
  }

  emit() { /* remote players' events arrive over the network instead */ }

  push(st) {
    this.buffer.push({ time: performance.now() / 1000, st });
    if (this.buffer.length > 30) this.buffer.shift();
  }

  /** Play a one-off animation (they threw a twig, picked one up). */
  once(name) { if (!this.sitting) this.avatar.once(name); }

  update(dt) {
    const t = performance.now() / 1000 - DELAY;
    const b = this.buffer;
    if (!b.length) return;
    let a = b[0], c = b[b.length - 1];
    for (let i = 0; i < b.length - 1; i++) if (b[i].time <= t && b[i + 1].time >= t) { a = b[i]; c = b[i + 1]; break; }
    const k = c.time > a.time ? THREE.MathUtils.clamp((t - a.time) / (c.time - a.time), 0, 1) : 1;
    const x = a.st.x + (c.st.x - a.st.x) * k, z = a.st.z + (c.st.z - a.st.z) * k;
    const moved = Math.hypot(x - this.pos.x, z - this.pos.z);
    this.speed += ((dt > 0 ? moved / dt : 0) - this.speed) * Math.min(1, dt * 8);
    this.pos.set(x, 0, z);
    let dh = ((c.st.h - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.heading += dh * Math.min(1, dt * 10);

    const st = c.st;
    const wasSitting = this.sitting;
    this.sitting = !!st.m;
    if (this.sitting && !wasSitting) this.avatar.once('Sit_Chair_Down');
    if (!this.sitting && wasSitting) this.avatar.once('Sit_Chair_StandUp');
    this.sink += ((this.sitting ? SIT_SINK : 0) - this.sink) * Math.min(1, dt * 6);
    this.pos.y = groundY(x, z) - this.sink;

    if (st.c !== this.carrying) { this.carrying = st.c; this.avatar.setCarrying(st.c); }
    this.avatar.setTorch(!!st.o);
    this.stick = st.k ? { mallow: st.k.d >= 0 ? { doneness: st.k.d, burning: !!st.k.b, heat: 0 } : null } : null;

    this.avatar.root.position.copy(this.pos);
    this.avatar.root.rotation.y = this.heading;
    const loco = this.sitting ? 'Sit_Chair_Idle' : this.speed > 3 ? 'Running_A' : this.speed > 0.25 ? 'Walking_A' : 'Idle';
    this.avatar.update(dt, loco);
    this.roaster.update(dt);
    this.tag.position.set(this.pos.x, this.pos.y + 2.25, this.pos.z);
  }

  dispose() {
    this.avatar.dispose(this.scene);
    this.scene.remove(this.tag, this.roaster.group, this.roaster.flames.mesh);
  }
}
