// ---------------------------------------------------------------------------
// The sound bed, synthesized live with Web Audio: the fire's low roar and
// crackle, crickets, a little wind, an owl now and then, and the small
// sounds of picking up and tossing twigs. Everything is positioned in 3D,
// so turning your head moves the fire from one ear to the other. The same
// spatial setup will carry people's voices in Phase 3.
// ---------------------------------------------------------------------------

export class Sound {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.white = this.noise(2, 'white');
    this.brown = this.noise(4, 'brown');
    this.pink = this.noise(4, 'pink');

    // Fire: a panner at the fire carries the roar and every pop
    this.firePan = this.panner(0, 0.6, 0, 2.2);
    this.firePan.connect(this.master);
    const roarSrc = this.loop(this.brown);
    const roarLP = ctx.createBiquadFilter(); roarLP.type = 'lowpass'; roarLP.frequency.value = 520;
    this.roar = ctx.createGain(); this.roar.gain.value = 0;
    roarSrc.connect(roarLP).connect(this.roar).connect(this.firePan);
    this.roarLP = roarLP;

    // Wind: bandpassed pink noise with a slow wandering center
    const windSrc = this.loop(this.pink);
    this.windBP = ctx.createBiquadFilter(); this.windBP.type = 'bandpass'; this.windBP.Q.value = 0.7; this.windBP.frequency.value = 380;
    this.wind = ctx.createGain(); this.wind.gain.value = 0.05;
    windSrc.connect(this.windBP).connect(this.wind).connect(this.master);

    // Crickets hidden in the dark around the clearing
    this.crickets = [0, 1, 2, 3].map((i) => {
      const a = i * 1.7 + 0.4, r = 14 + i * 3;
      const p = this.panner(Math.cos(a) * r, 0.2, Math.sin(a) * r, 6);
      p.connect(this.master);
      return { pan: p, freq: 4100 + i * 230, next: Math.random() * 2, rate: 0.55 + i * 0.12 };
    });
    this.owlNext = 18 + Math.random() * 30;
    this.crackleDebt = 0;
    this.t = 0;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  noise(seconds, color) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (color === 'pink') { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6; }
      else d[i] = w;
    }
    return buf;
  }
  loop(buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * buf.duration); return s; }
  panner(x, y, z, ref = 1) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    return p;
  }
  setPos(p, x, y, z) {
    if (p.positionX) { const t = this.ctx.currentTime; p.positionX.setTargetAtTime(x, t, 0.05); p.positionY.setTargetAtTime(y, t, 0.05); p.positionZ.setTargetAtTime(z, t, 0.05); }
    else p.setPosition(x, y, z);
  }

  /** A short filtered noise burst; the building block of crackles and snaps. */
  pop(dest, { freq = 2500, q = 1.2, dur = 0.03, gain = 0.4, when = 0 } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5, dur + 0.02);
  }

  chirp(c) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = c.freq;
    const g = ctx.createGain(); g.gain.value = 0;
    for (let k = 0; k < 3; k++) {
      const t = t0 + k * 0.055;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.008); g.gain.linearRampToValueAtTime(0, t + 0.035);
    }
    o.connect(g).connect(c.pan); o.start(t0); o.stop(t0 + 0.2);
  }

  owl() {
    const ctx = this.ctx, a = Math.random() * Math.PI * 2;
    const p = this.panner(Math.cos(a) * 30, 8, Math.sin(a) * 30, 10); p.connect(this.master);
    const hoots = [[0, 0.45], [0.75, 0.25], [1.1, 0.6]];
    for (const [off, len] of hoots) {
      const t = ctx.currentTime + off;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(410, t); o.frequency.exponentialRampToValueAtTime(355, t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.06); g.gain.setTargetAtTime(0, t + len - 0.1, 0.06);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      o.connect(lp).connect(g).connect(p); o.start(t); o.stop(t + len + 0.4);
    }
  }

  /** A distant wolf howl: a slow rising-then-falling glide with a little waver. */
  howl(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const a = Math.atan2(pos?.z ?? 1, pos?.x ?? 0);
    const p = this.panner(Math.cos(a) * 40, 4, Math.sin(a) * 40, 12); p.connect(this.master);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(330, t); o.frequency.linearRampToValueAtTime(560, t + 0.9);
    o.frequency.setValueAtTime(560, t + 2.0); o.frequency.exponentialRampToValueAtTime(380, t + 3.4);
    const vib = ctx.createOscillator(); vib.frequency.value = 5.5;
    const vibG = ctx.createGain(); vibG.gain.value = 7; vib.connect(vibG).connect(o.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.11, t + 0.6); g.gain.setValueAtTime(0.11, t + 2.6); g.gain.linearRampToValueAtTime(0, t + 3.6);
    o.connect(lp).connect(bp).connect(g).connect(p);
    o.start(t); vib.start(t); o.stop(t + 3.8); vib.stop(t + 3.8);
  }
  /** A fox's sharp little yip. */
  yip(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const p = this.panner(pos.x, 0.5, pos.z, 2); p.connect(this.master);
    for (const off of [0, 0.16]) {
      const t = ctx.currentTime + off;
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.05); o.frequency.exponentialRampToValueAtTime(700, t + 0.12);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(g).connect(p); o.start(t); o.stop(t + 0.16);
    }
  }
  /** Lifting a crate lid. */
  creak() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(230, t + 0.35);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 0.4);
    o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + 0.45);
  }
  /** Blowing out a burning marshmallow. */
  puff() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.pink;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random(), 0.4);
  }

  // Event sounds
  snap() { if (this.ctx) { this.pop(this.master, { freq: 3200, q: 2, dur: 0.025, gain: 0.25 }); this.pop(this.master, { freq: 1800, q: 2, dur: 0.04, gain: 0.18, when: 0.03 }); } }
  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5;
    f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    s.connect(f).connect(g).connect(this.master); s.start(t, 0, 0.35);
  }
  landed(size) {
    if (!this.ctx) return;
    for (let i = 0; i < 7; i++) this.pop(this.firePan, { freq: 900 + Math.random() * 3500, q: 1, dur: 0.02 + Math.random() * 0.05, gain: 0.35 + size * 0.3, when: i * (0.02 + Math.random() * 0.06) });
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.brown;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    s.connect(lp).connect(g).connect(this.firePan); s.start(t, Math.random() * 2, 1);
  }

  /** Called every frame with the camera (the listener) and the fire's size. */
  update(dt, camera, fireSize, embers) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.t += dt;
    const L = this.ctx.listener, p = camera.position, t = this.ctx.currentTime;
    const fwd = camera.getWorldDirection(this._f || (this._f = camera.position.clone())), up = camera.up;
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.03); L.positionY.setTargetAtTime(p.y, t, 0.03); L.positionZ.setTargetAtTime(p.z, t, 0.03);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.03); L.forwardY.setTargetAtTime(fwd.y, t, 0.03); L.forwardZ.setTargetAtTime(fwd.z, t, 0.03);
      L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }

    this.setPos(this.firePan, 0, 0.4 + fireSize, 0);
    this.roar.gain.setTargetAtTime(embers ? 0.04 : 0.12 + 0.75 * fireSize, t, 0.3);
    this.roarLP.frequency.setTargetAtTime(embers ? 260 : 380 + 520 * fireSize, t, 0.3);
    this.windBP.frequency.setTargetAtTime(300 + 220 * Math.sin(this.t * 0.07) + 90 * Math.sin(this.t * 0.31), t, 0.5);
    this.wind.gain.setTargetAtTime(0.035 + 0.025 * (0.5 + 0.5 * Math.sin(this.t * 0.11)), t, 0.5);

    // Crackles: more and louder as the fire grows; sparse ticks from embers
    this.crackleDebt += dt * (embers ? 0.6 : 3 + 22 * fireSize);
    while (this.crackleDebt >= 1) {
      this.crackleDebt -= Math.random() < 0.5 ? 1 : 0.6;
      const big = Math.random() < 0.08 + fireSize * 0.1;
      this.pop(this.firePan, {
        freq: big ? 700 + Math.random() * 900 : 1500 + Math.random() * 4500,
        q: 0.8 + Math.random(), dur: big ? 0.06 : 0.012 + Math.random() * 0.03,
        gain: (embers ? 0.07 : 0.12 + 0.3 * fireSize) * (big ? 1.6 : 0.5 + Math.random() * 0.5),
        when: Math.random() * 0.05,
      });
    }

    for (const c of this.crickets) {
      c.next -= dt;
      if (c.next <= 0) {
        this.chirp(c);
        c.next = c.rate + Math.random() * 0.15;
        if (Math.random() < 0.08) c.next += 3 + Math.random() * 6; // a cricket goes quiet for a moment
      }
    }
    this.owlNext -= dt;
    if (this.owlNext <= 0) { this.owl(); this.owlNext = 45 + Math.random() * 70; }
  }
}
