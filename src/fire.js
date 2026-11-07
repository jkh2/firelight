import * as THREE from 'three';

// ---------------------------------------------------------------------------
// The fire. One number drives everything: fuel, measured in twigs.
// Fuel burns steadily (faster when the fire is big), so a fire left alone
// shrinks, then settles into embers that never go out. One twig on the
// embers brings it back.
// ---------------------------------------------------------------------------

import { FIRE, burn } from '../shared/rules.js';
export { FIRE };

/** Fuel to visual size: 0 = embers, 1 = towering bonfire. */
export function sizeFromFuel(fuel) {
  return Math.min(1.15, Math.sqrt(Math.max(0, fuel) / FIRE.bonfireFuel));
}

const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

// GPU particles: every particle's whole life is computed in the vertex
// shader from time and its seed, so the CPU never touches them.
const flameVert = /* glsl */`
  attribute vec4 aSeed;
  uniform float uTime, uSize, uHeight, uRadius, uScale, uRate;
  varying vec2 vUv; varying float vLife; varying float vAlpha;
  float h(float n){ return fract(sin(n * 91.345) * 47453.5453); }
  void main(){
    vUv = position.xy + 0.5;
    float rate = mix(0.85, 1.45, aSeed.y) * uRate;
    float t = uTime * rate + aSeed.x;
    float life = fract(t);
    float cyc = floor(t);
    float ang = h(cyc + aSeed.z * 17.0) * 6.2832;
    float r = sqrt(h(cyc * 1.7 + aSeed.w * 29.0)) * uRadius;
    vec3 start = vec3(cos(ang) * r, 0.04, sin(ang) * r);
    float rise = life * uHeight * mix(0.55, 1.0, h(cyc + aSeed.y * 7.0));
    float sway = sin(uTime * 3.1 + aSeed.z * 20.0) * 0.07 * life * uHeight;
    vec3 c = start * (1.0 - life * 0.8) + vec3(sway, rise, cos(uTime * 2.7 + aSeed.w * 13.0) * 0.05 * life * uHeight);
    float scale = mix(0.55, 0.12, life) * uScale;
    vec4 mv = modelViewMatrix * vec4(c, 1.0);
    mv.x += position.x * scale * 0.85;
    mv.y += position.y * scale * 1.35;
    gl_Position = projectionMatrix * mv;
    vLife = life;
    vAlpha = smoothstep(0.0, 0.08, life) * (1.0 - life);
  }`;

const flameFrag = /* glsl */`
  uniform float uIntensity; uniform vec3 uTint;
  varying vec2 vUv; varying float vLife; varying float vAlpha;
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(vec2(p.x, p.y * 0.85));
    float a = 1.0 - smoothstep(0.0, 1.0, d);
    a *= a;
    vec3 c1 = vec3(1.0, 0.86, 0.55), c2 = vec3(1.0, 0.48, 0.12), c3 = vec3(0.75, 0.16, 0.04), c4 = vec3(0.25, 0.04, 0.02);
    vec3 col = vLife < 0.18 ? mix(c1, c2, vLife / 0.18)
             : vLife < 0.6 ? mix(c2, c3, (vLife - 0.18) / 0.42)
             : mix(c3, c4, (vLife - 0.6) / 0.4);
    gl_FragColor = vec4(col * uTint, a * vAlpha * uIntensity);
  }`;

const smokeVert = /* glsl */`
  attribute vec4 aSeed;
  uniform float uTime, uHeight, uScale;
  varying vec2 vUv; varying float vLife;
  void main(){
    vUv = position.xy + 0.5;
    float life = fract(uTime * mix(0.12, 0.2, aSeed.y) + aSeed.x);
    float drift = life * life;
    vec3 c = vec3(sin(aSeed.z * 6.28 + uTime * 0.3) * drift * 1.2 + drift * 0.8,
                  0.6 + life * uHeight,
                  cos(aSeed.w * 6.28 + uTime * 0.25) * drift * 1.2);
    float scale = mix(0.5, 2.6, life) * uScale;
    vec4 mv = modelViewMatrix * vec4(c, 1.0);
    mv.xy += position.xy * scale;
    gl_Position = projectionMatrix * mv;
    vLife = life;
  }`;

const smokeFrag = /* glsl */`
  uniform float uGlow, uDensity;
  varying vec2 vUv; varying float vLife;
  void main(){
    float d = length(vUv * 2.0 - 1.0);
    float a = (1.0 - smoothstep(0.2, 1.0, d)) * smoothstep(0.0, 0.12, vLife) * (1.0 - vLife) * uDensity;
    vec3 lit = mix(vec3(0.55, 0.22, 0.08) * uGlow, vec3(0.06, 0.06, 0.07), smoothstep(0.0, 0.45, vLife));
    gl_FragColor = vec4(lit, a);
  }`;

const emberVert = /* glsl */`
  varying vec3 vPos; varying vec3 vN;
  void main(){ vPos = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const emberFrag = /* glsl */`
  uniform float uTime, uGlow;
  varying vec3 vPos; varying vec3 vN;
  float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float noise(vec3 p){
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main(){
    float n = noise(vPos * 9.0 + vec3(0.0, uTime * 0.15, 0.0)) * 0.65 + noise(vPos * 23.0 - uTime * 0.3) * 0.35;
    float breathe = 0.75 + 0.25 * sin(uTime * 0.9 + vPos.x * 6.0);
    float hot = smoothstep(0.42, 0.78, n) * uGlow * breathe;
    vec3 coal = vec3(0.035, 0.03, 0.03);
    vec3 glow = mix(vec3(0.6, 0.08, 0.02), vec3(1.0, 0.55, 0.15), smoothstep(0.65, 0.95, n));
    gl_FragColor = vec4(coal + glow * hot * 2.2, 1.0);
  }`;

function quadInstances(count) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = count;
  return g;
}

/** A cluster of GPU flame tongues. Used for the fire and for each torch. */
export class Flames {
  constructor(max = 140) {
    this.max = max;
    this.uniforms = {
      uTime: { value: 0 }, uSize: { value: 0.5 }, uHeight: { value: 1 }, uRadius: { value: 0.4 },
      uScale: { value: 1 }, uRate: { value: 1 }, uIntensity: { value: 0.5 }, uTint: { value: new THREE.Color(1, 1, 1) },
    };
    this.mesh = new THREE.Mesh(quadInstances(max), new THREE.ShaderMaterial({
      vertexShader: flameVert, fragmentShader: flameFrag, uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }
  set(count, height, radius, scale, intensity, rate = 1) {
    this.mesh.geometry.instanceCount = Math.max(0, Math.min(this.max, Math.round(count)));
    const u = this.uniforms;
    u.uHeight.value = height; u.uRadius.value = radius; u.uScale.value = scale; u.uIntensity.value = intensity; u.uRate.value = rate;
  }
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,190,110,1)'); grd.addColorStop(0.25, 'rgba(255,120,40,0.45)');
  grd.addColorStop(0.6, 'rgba(160,50,10,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Fire {
  constructor(scene) {
    this.fuel = FIRE.startFuel;
    this.size = sizeFromFuel(this.fuel); // displayed size, eases toward target
    this.flare = 0;                       // brief flare after a twig lands
    this.time = 0;
    this.listeners = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    // Stone ring
    const stoneGeo = new THREE.DodecahedronGeometry(0.22, 0);
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x3a3836 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + hash(i) * 0.2;
      const s = new THREE.Mesh(stoneGeo, stoneMat);
      s.position.set(Math.cos(a) * 1.18, 0.08, Math.sin(a) * 1.18);
      s.scale.set(0.9 + hash(i + 3) * 0.6, 0.55 + hash(i + 7) * 0.35, 0.9 + hash(i + 11) * 0.5);
      s.rotation.set(hash(i + 1) * 3, hash(i + 2) * 3, 0);
      this.group.add(s);
    }

    // Ember bed: a low heap of coals with a glowing shader
    const bed = new THREE.SphereGeometry(0.85, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    bed.scale(1, 0.22, 1);
    const pos = bed.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setY(i, y + (hash(i * 3.1) - 0.5) * 0.04 * (y > 0.01 ? 1 : 0));
    }
    bed.computeVertexNormals();
    this.emberUniforms = { uTime: { value: 0 }, uGlow: { value: 1 } };
    this.bed = new THREE.Mesh(bed, new THREE.ShaderMaterial({ vertexShader: emberVert, fragmentShader: emberFrag, uniforms: this.emberUniforms }));
    this.group.add(this.bed);

    // Logs in a teepee; more of them show as the fire grows
    this.logs = [];
    const logGeo = new THREE.CylinderGeometry(0.07, 0.09, 1.3, 7);
    logGeo.translate(0, 0.65, 0);
    this.logMat = new THREE.MeshLambertMaterial({ color: 0x2a1a10, emissive: new THREE.Color(0xff5a14), emissiveIntensity: 0.15 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + (i % 2) * 0.25;
      const log = new THREE.Mesh(logGeo, this.logMat);
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(a) * 0.62, 0.02, Math.sin(a) * 0.62);
      pivot.rotation.y = -a;
      log.rotation.z = 0.62 + hash(i) * 0.12; // lean in toward the center
      pivot.add(log);
      this.group.add(pivot);
      this.logs.push(pivot);
    }

    // Flames, smoke, glow, light
    this.flames = new Flames(150);
    this.group.add(this.flames.mesh);

    this.smokeUniforms = { uTime: { value: 0 }, uHeight: { value: 4 }, uScale: { value: 1 }, uGlow: { value: 1 }, uDensity: { value: 0.2 } };
    this.smoke = new THREE.Mesh(quadInstances(36), new THREE.ShaderMaterial({
      vertexShader: smokeVert, fragmentShader: smokeFrag, uniforms: this.smokeUniforms, transparent: true, depthWrite: false,
    }));
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 2;
    this.group.add(this.smoke);

    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glow.renderOrder = 4;
    this.group.add(this.glow);

    this.light = new THREE.PointLight(0xff8a3a, 30, 0, 1.6);
    this.light.position.set(0, 1, 0);
    this.group.add(this.light);

    // Sparks: a small CPU particle pool
    this.sparkMax = 360;
    this.sparkPos = new Float32Array(this.sparkMax * 3);
    this.sparkVel = new Float32Array(this.sparkMax * 3);
    this.sparkLife = new Float32Array(this.sparkMax);
    this.sparkTTL = new Float32Array(this.sparkMax);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    sg.setAttribute('life', new THREE.BufferAttribute(this.sparkLife, 1));
    this.sparks = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: { uPx: { value: 1 } },
      vertexShader: `attribute float life; varying float vL; uniform float uPx;
        void main(){ vL = life; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = life > 0.0 ? clamp(26.0 * uPx / -mv.z, 1.5, 7.0) : 0.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vL; void main(){ if (vL <= 0.0) discard; vec2 p = gl_PointCoord * 2.0 - 1.0;
          float a = 1.0 - smoothstep(0.2, 1.0, length(p)); vec3 c = mix(vec3(0.9, 0.2, 0.03), vec3(1.0, 0.8, 0.4), vL);
          gl_FragColor = vec4(c, a * min(1.0, vL * 2.5)); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 5;
    this.group.add(this.sparks);
    this.sparkCursor = 0;
    this.sparkDebt = 0;
  }

  get target() { return sizeFromFuel(this.fuel); }
  get isEmbers() { return this.fuel <= 0.05; }

  /** Where twigs land and where the crackle comes from. */
  get center() { return new THREE.Vector3(0, 0.25 + this.size * 0.4, 0); }
  /** Radius of the hot zone players can't walk into. */
  get pitRadius() { return 1.35; }

  addFuel(amount = 1) {
    const wasEmbers = this.isEmbers;
    this.fuel = Math.min(FIRE.maxFuel, this.fuel + amount);
    this.flare = 1;
    this.burst(28 + Math.round(this.size * 30));
    for (const fn of this.listeners) fn(wasEmbers ? 'rekindled' : 'fed');
  }
  on(fn) { this.listeners.push(fn); }

  emit(n, speed = 1) {
    for (let k = 0; k < n; k++) {
      const i = this.sparkCursor; this.sparkCursor = (this.sparkCursor + 1) % this.sparkMax;
      const a = Math.random() * Math.PI * 2, r = Math.random() * (0.2 + this.size * 0.5);
      this.sparkPos[i * 3] = Math.cos(a) * r;
      this.sparkPos[i * 3 + 1] = 0.3 + this.size * 0.8 * Math.random();
      this.sparkPos[i * 3 + 2] = Math.sin(a) * r;
      this.sparkVel[i * 3] = (Math.random() - 0.5) * 0.9 * speed;
      this.sparkVel[i * 3 + 1] = (1.4 + Math.random() * 2.4) * (0.6 + this.size) * speed;
      this.sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 0.9 * speed;
      this.sparkTTL[i] = 1 + Math.random() * 1.8;
      this.sparkLife[i] = 1;
    }
  }
  burst(n) { this.emit(n, 1.5); }

  update(dt) {
    this.time += dt;
    // Burn
    this.fuel = burn(this.fuel, dt);
    const tgt = this.target;
    // Growth catches over a couple of seconds; shrinking follows the fuel directly
    this.size += (tgt - this.size) * (1 - Math.exp(-dt * (tgt > this.size ? 0.9 : 3)));
    this.flare = Math.max(0, this.flare - dt * 1.6);
    const s = this.size, t = this.time;

    // Flicker from layered sines, cheap and organic
    const flicker = 1 + 0.12 * Math.sin(t * 9.7) * Math.sin(t * 6.3 + 1) + 0.08 * Math.sin(t * 23.1) + 0.06 * Math.sin(t * 3.1);
    const embers = s < 0.06;
    const live = Math.min(1, s / 0.12);

    this.flames.uniforms.uTime.value = t;
    this.flames.set(
      6 + 144 * Math.min(1, s),
      0.14 + 4.6 * Math.pow(s, 0.9),
      0.12 + 0.75 * Math.pow(s, 0.7),
      0.35 + 1.45 * s,
      (embers ? 0.22 : 0.46) + 0.15 * this.flare,
      1.15 - 0.3 * s,
    );
    this.flames.uniforms.uTint.value.setRGB(1, embers ? 0.7 : 1, embers ? 0.6 : 1);

    this.smokeUniforms.uTime.value = t;
    this.smokeUniforms.uHeight.value = 2 + 6 * s;
    this.smokeUniforms.uScale.value = 0.5 + 1.1 * s;
    this.smokeUniforms.uGlow.value = 0.3 + 0.9 * live;
    this.smokeUniforms.uDensity.value = embers ? 0.06 : 0.12 + 0.1 * s;

    this.emberUniforms.uTime.value = t;
    this.emberUniforms.uGlow.value = embers ? 0.85 + 0.2 * Math.sin(t * 0.7) : 0.8 + 0.5 * live;

    // Logs: a small teepee grows into a big stack
    const visibleLogs = embers ? 0 : Math.min(12, 3 + Math.floor(s * 9));
    const pile = 0.55 + 0.5 * Math.min(1.1, s);
    this.logs.forEach((l, i) => { l.visible = i < visibleLogs; l.scale.setScalar(pile); });
    this.logMat.emissiveIntensity = 0.05 + 0.2 * live * flicker;

    this.glow.position.set(0, 0.35 + s * 1.1, 0);
    this.glow.scale.setScalar(embers ? 2.2 : 2.2 + 8.5 * s);
    this.glow.material.opacity = (embers ? 0.25 : 0.35 + 0.2 * s) * (0.9 + 0.1 * flicker) + 0.2 * this.flare;

    const intensity = embers ? 9 + 2 * Math.sin(t * 0.7) : 10 + 230 * Math.pow(s, 1.35);
    this.light.intensity = intensity * flicker * (1 + 0.35 * this.flare);
    this.light.color.setRGB(1, embers ? 0.32 : 0.5 + 0.08 * s, embers ? 0.12 : 0.2 + 0.05 * s);
    this.light.position.set(Math.sin(t * 5.3) * 0.04 * s, 0.5 + s * 1.3, Math.cos(t * 4.1) * 0.04 * s);

    // Sparks
    this.sparkDebt += dt * (embers ? 0.4 : 1.5 + 40 * Math.pow(s, 1.5));
    const n = Math.floor(this.sparkDebt); this.sparkDebt -= n; this.emit(n);
    for (let i = 0; i < this.sparkMax; i++) {
      if (this.sparkLife[i] <= 0) continue;
      const j = i * 3;
      this.sparkVel[j] += Math.sin(t * 3 + i) * 0.6 * dt;
      this.sparkVel[j + 2] += Math.cos(t * 2.6 + i * 1.3) * 0.6 * dt;
      const damp = Math.exp(-dt * 0.9);
      this.sparkVel[j] *= damp; this.sparkVel[j + 1] *= damp; this.sparkVel[j + 2] *= damp;
      this.sparkPos[j] += this.sparkVel[j] * dt; this.sparkPos[j + 1] += this.sparkVel[j + 1] * dt; this.sparkPos[j + 2] += this.sparkVel[j + 2] * dt;
      this.sparkLife[i] -= dt / this.sparkTTL[i];
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.geometry.attributes.life.needsUpdate = true;
  }
}
