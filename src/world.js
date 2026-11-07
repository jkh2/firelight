import * as THREE from 'three';

// ---------------------------------------------------------------------------
// The clearing: ground, sky, trees, rocks, grass, and the ring of seats.
// Everything is sized in meters. The fire sits at the origin.
// ---------------------------------------------------------------------------

export const WORLD = {
  walkRadius: 17.5,   // how far from the fire anyone can wander
  seatRadius: 3.35,
  seatCount: 10,
};

let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Ground height: flat in the clearing, rolling beyond it. */
export function groundY(x, z) {
  const r = Math.hypot(x, z);
  const rise = THREE.MathUtils.smoothstep(r, 15, 34);
  return rise * (vnoise(x * 0.08, z * 0.08) * 3.2 + r * 0.06);
}

function buildGround() {
  const g = new THREE.PlaneGeometry(160, 160, 160, 160);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const ash = new THREE.Color(0x1b1715), dirt = new THREE.Color(0x3a2a1c), grass = new THREE.Color(0x1f3318), grass2 = new THREE.Color(0x2b4220);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
    pos.setY(i, groundY(x, z));
    const n = vnoise(x * 0.35, z * 0.35);
    c.copy(grass).lerp(grass2, n);
    c.lerp(dirt, 1 - THREE.MathUtils.smoothstep(r, 3.2 + n * 1.5, 6.5 + n * 2.5));
    c.lerp(ash, 1 - THREE.MathUtils.smoothstep(r, 1.0, 1.9));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.name = 'ground';
  return m;
}

// Sky dome with stars. uDim drops when the fire is bright: your eyes adjust.
function buildSky() {
  const group = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vDir; void main(){ float h = max(vDir.y, 0.0);
      vec3 c = mix(vec3(0.035, 0.045, 0.075), vec3(0.006, 0.008, 0.016), pow(h, 0.45));
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  group.add(dome);

  const N = 2200;
  const p = new Float32Array(N * 3), size = new Float32Array(N), tw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // Bias some stars into a faint band across the sky
    const band = i < N * 0.35;
    let u = rand() * 2 - 1, th = rand() * Math.PI * 2;
    if (band) { th = rand() * Math.PI * 2; u = Math.sin(th * 1.0) * 0.35 + (rand() - 0.5) * 0.18; }
    let y = Math.abs(band ? Math.cos(th) * 0.7 + 0.25 : u) * 0.95 + 0.05;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = band ? th * 0.5 + 0.6 : rand() * Math.PI * 2;
    p[i * 3] = Math.cos(a) * r * 280; p[i * 3 + 1] = y * 280; p[i * 3 + 2] = Math.sin(a) * r * 280;
    size[i] = Math.pow(rand(), 6) * 3.2 + 0.7;
    tw[i] = rand() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aTw', new THREE.BufferAttribute(tw, 1));
  const uniforms = { uTime: { value: 0 }, uDim: { value: 1 }, uPx: { value: 1 } };
  const stars = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSize; attribute float aTw; uniform float uTime, uDim, uPx; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float twinkle = 0.75 + 0.25 * sin(uTime * (1.5 + fract(aTw) * 3.0) + aTw);
        // Dim stars vanish first when the fire is bright
        float vis = smoothstep(uDim * 2.6, uDim * 2.6 + 1.0, aSize);
        vA = twinkle * mix(0.25, 1.0, vis) * (0.35 + 0.65 * (1.0 - uDim * 0.6));
        gl_PointSize = aSize * uPx; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float d = dot(p, p);
        if (d > 1.0) discard; gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), (1.0 - d) * vA); }`,
  }));
  stars.renderOrder = -1;
  group.add(stars);

  // Shooting star: a streak that crosses part of the sky now and then
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  streakGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 0, 0, 0]), 3));
  const streak = new THREE.Line(streakGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
  streak.visible = false;
  streak.frustumCulled = false;
  group.add(streak);

  let next = 25 + rand() * 40, t0 = -1, from = new THREE.Vector3(), dir = new THREE.Vector3();
  return {
    group, uniforms,
    update(dt, time, dim) {
      uniforms.uTime.value = time;
      uniforms.uDim.value = dim;
      next -= dt;
      if (next <= 0 && t0 < 0) {
        t0 = time; next = 50 + rand() * 90;
        const a = rand() * Math.PI * 2, el = 0.45 + rand() * 0.4;
        from.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).multiplyScalar(250);
        dir.set(-Math.sin(a), -0.35 - rand() * 0.3, Math.cos(a)).normalize();
      }
      if (t0 >= 0) {
        const k = (time - t0) / 0.9;
        if (k > 1) { t0 = -1; streak.visible = false; return; }
        const head = from.clone().addScaledVector(dir, k * 120), tail = head.clone().addScaledVector(dir, -22 * Math.sin(k * Math.PI));
        const a = streakGeo.attributes.position;
        a.setXYZ(0, head.x, head.y, head.z); a.setXYZ(1, tail.x, tail.y, tail.z); a.needsUpdate = true;
        streak.material.opacity = Math.sin(k * Math.PI) * (1 - dim * 0.5);
        streak.visible = true;
      }
    },
  };
}

/** Instances one prop many times, keeping its child meshes and materials. */
export function instanceProp(source, transforms, { tint = 1 } = {}) {
  const group = new THREE.Group();
  if (!transforms.length) return group;
  source.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(source.matrixWorld).invert();
  source.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    const mat = new THREE.MeshLambertMaterial({
      map: src.map ?? null, color: src.color.clone().multiplyScalar(tint),
      alphaTest: src.alphaTest || (src.map && src.transparent ? 0.5 : 0), side: src.side,
    });
    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
    const im = new THREE.InstancedMesh(o.geometry, mat, transforms.length);
    const local = inv.clone().multiply(o.matrixWorld);
    transforms.forEach((m, i) => im.setMatrixAt(i, m.clone().multiply(local)));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
  });
  return group;
}

/** A single placed copy of a prop. */
export function propCopy(source) {
  const c = source.clone(true);
  c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.set(1, 1, 1);
  c.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    o.material = new THREE.MeshLambertMaterial({ map: src.map ?? null, color: src.color, alphaTest: src.alphaTest, side: src.side });
  });
  return c;
}

/** A WoodLog sized in meters, lying along its local x axis whatever the model's own orientation. */
export function makeLog(props, length, thick) {
  const log = propCopy(props.getObjectByName('WoodLog'));
  let size = new THREE.Box3().setFromObject(log).getSize(new THREE.Vector3());
  if (size.z > size.x) { log.rotation.y = Math.PI / 2; size = new THREE.Vector3(size.z, size.y, size.x); }
  const holder = new THREE.Group();
  holder.add(log);
  holder.scale.set(length / size.x, thick / size.y, thick / size.z);
  // Sit the log on the ground
  const box = new THREE.Box3().setFromObject(holder);
  log.position.y -= box.min.y / holder.scale.y;
  return holder;
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
const place = (x, z, s, yaw, sink = 0, tilt = 0) => tmpM.compose(new THREE.Vector3(x, groundY(x, z) - sink, z), tmpQ.setFromEuler(tmpE.set(tilt, yaw, 0)), new THREE.Vector3(s, s, s)).clone();

// The camp sits just outside the seat ring: a tent, a pack, a woodpile.
export const CAMP = { angle: 2.35, radius: 7.6 };

function buildForest(props, colliders) {
  const get = (n) => props.getObjectByName(n);
  const group = new THREE.Group();
  const near = { Pine_1: [], Pine_2: [], Pine_3: [], Pine_4: [], Pine_5: [], CommonTree_1: [], DeadTree_1: [], DeadTree_3: [] };
  const nearKinds = ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5', 'Pine_1', 'Pine_3', 'CommonTree_1', 'DeadTree_1', 'Pine_2'];
  const far = [];
  const free = (x, z, r) => colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + r);

  // Sentinel trees close in: only a big bonfire lights them
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, r = i < 12 ? 11 + rand() * 4.5 : 15.5 + rand() * 13;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!free(x, z, 1.6)) continue;
    const kind = nearKinds[Math.floor(rand() * nearKinds.length)];
    near[kind].push(place(x, z, 1.05 + rand() * 0.45, rand() * 6.28, 0.15));
    colliders.push({ x, z, r: 0.5 });
  }
  // A lone dead snag stands at the edge of the light
  { const a = 4.1, r = 12.5, x = Math.cos(a) * r, z = Math.sin(a) * r; near.DeadTree_3.push(place(x, z, 1, 0.7, 0.2)); colliders.push({ x, z, r: 0.6 }); }
  // The far forest wall: cheap silhouettes, dark and swallowed by fog
  for (let i = 0; i < 240; i++) {
    const a = rand() * Math.PI * 2, r = 27 + Math.pow(rand(), 0.8) * 34;
    far.push(place(Math.cos(a) * r, Math.sin(a) * r, 8 + rand() * 5, rand() * 6.28, 0.2));
  }
  for (const [k, list] of Object.entries(near)) group.add(instanceProp(get(k), list));
  group.add(instanceProp(get('tree_single_B'), far, { tint: 0.35 }));

  // Rocks, ferns, bushes, mushrooms, pebbles
  const scatter = (name, n, rMin, rMax, sMin, sMax, opts = {}) => {
    const list = [];
    for (let i = 0; i < n * 3 && list.length < n; i++) {
      const a = rand() * Math.PI * 2, r = rMin + Math.pow(rand(), opts.bias ?? 1) * (rMax - rMin);
      if (r > 2.4 && r < 4.4 && !opts.ring) continue; // keep the seat ring clear
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (opts.clump && vnoise(x * 0.25, z * 0.25) < 0.45) continue;
      if (!free(x, z, opts.pad ?? 0.2)) continue;
      list.push(place(x, z, sMin + rand() * (sMax - sMin), rand() * 6.28, opts.sink ?? 0));
      if (opts.solid) colliders.push({ x, z, r: opts.solid * (sMin + sMax) / 2 });
    }
    group.add(instanceProp(get(name), list, { tint: opts.tint ?? 1 }));
  };
  scatter('Rock_Medium_1', 10, 6, 26, 0.35, 0.8, { solid: 1.4, pad: 0.8, sink: 0.08, tint: 0.6 });
  scatter('Rock_Medium_2', 10, 6, 26, 0.3, 0.7, { solid: 1.3, pad: 0.8, sink: 0.08, tint: 0.6 });
  scatter('Rock_Medium_3', 8, 6, 26, 0.3, 0.6, { solid: 1.4, pad: 0.8, sink: 0.08, tint: 0.6 });
  scatter('Bush_Common', 34, 8, 26, 0.6, 1.0, { clump: true, pad: 0.6, tint: 0.7 });
  scatter('Fern_1', 60, 5.5, 22, 0.55, 1.0, { clump: true });
  scatter('Plant_1', 50, 5, 22, 0.35, 0.6, { clump: true });
  scatter('Mushroom_Common', 26, 6, 18, 0.35, 0.6, { clump: true });
  scatter('Pebble_Round_1', 16, 1.8, 9, 0.5, 0.9, { ring: true, tint: 0.45 });
  scatter('Pebble_Round_3', 16, 1.8, 9, 0.5, 0.9, { ring: true, tint: 0.45 });
  return group;
}

function buildGrass(props) {
  const group = new THREE.Group();
  const short = [], tall = [];
  for (let i = 0; i < 4200 && short.length + tall.length < 1300; i++) {
    const a = rand() * Math.PI * 2, r = 4.8 + Math.pow(rand(), 0.85) * 30;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (vnoise(x * 0.3, z * 0.3) < 0.4) continue;
    if (rand() < 0.82) short.push(place(x, z, 0.28 + rand() * 0.22, rand() * 6.28));
    else tall.push(place(x, z, 0.32 + rand() * 0.2, rand() * 6.28));
  }
  group.add(instanceProp(props.getObjectByName('Grass_Common_Short'), short));
  group.add(instanceProp(props.getObjectByName('Grass_Wispy_Tall'), tall));
  return group;
}

function buildCamp(props, colliders) {
  const g = new THREE.Group();
  const cx = Math.cos(CAMP.angle) * CAMP.radius, cz = Math.sin(CAMP.angle) * CAMP.radius;
  const toFire = Math.atan2(-cx, -cz);
  const put = (name, s, dx, dz, yaw, y = 0, tilt = null) => {
    const o = propCopy(props.getObjectByName(name));
    // offsets are in camp space: +z points at the fire, +x to the camp's left
    const c = Math.cos(toFire), sn = Math.sin(toFire);
    const x = cx + dx * c + dz * sn, z = cz - dx * sn + dz * c;
    o.position.set(x, groundY(x, z) + y, z);
    o.rotation.y = toFire + yaw;
    if (tilt) o.rotation.set(tilt[0], toFire + yaw, tilt[2], 'YXZ');
    o.scale.setScalar(s);
    g.add(o);
    return { o, x, z };
  };
  function placeLog(dx, dz, yaw, y) {
    const o = makeLog(props, 1.3, 0.24);
    const c = Math.cos(toFire), sn = Math.sin(toFire);
    const x = cx + dx * c + dz * sn, z = cz - dx * sn + dz * c;
    o.position.set(x, groundY(x, z) + y, z);
    o.rotation.y = toFire + yaw;
    g.add(o);
    return { o, x, z };
  }
  const tent = put('Tent', 0.17, 0, -0.6, Math.PI / 2);
  colliders.push({ x: tent.x, z: tent.z, r: 1.7 });
  put('Backpack', 0.2, 1.9, 0.7, -0.5, 0.3);
  // Woodpile: three logs stacked
  const pile = placeLog(-2.6, 0.35, 1.25, 0);
  placeLog(-2.6, 0.75, 1.2, 0);
  placeLog(-2.6, 0.55, 1.22, 0.24);
  colliders.push({ x: pile.x, z: pile.z, r: 0.75 });
  // The axe rests against the pile
  put('Axe', 0.22, -2.0, 0.55, 0.4, 0.05, [0.0, 0, -0.45]);
  // A pot warming on the stones by the fire
  const p = new THREE.Vector3(Math.cos(CAMP.angle + 0.35) * 1.45, 0, Math.sin(CAMP.angle + 0.35) * 1.45);
  const pot = propCopy(props.getObjectByName('Pot'));
  pot.position.set(p.x, 0.05, p.z); pot.scale.setScalar(0.22); pot.rotation.y = 0.8;
  g.add(pot);
  return g;
}

// Seats: logs and camp chairs in a ring, each facing the fire.
function buildSeats(props, colliders) {
  const group = new THREE.Group();
  const seats = [];
  const metal = new THREE.MeshLambertMaterial({ color: 0x3b3f44 });
  const fabrics = [0x2f5a3a, 0x8a3b24, 0x2b3f63, 0x6b5a2a].map((c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
  const legGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.3, 5);
  let chair = 0;

  for (let i = 0; i < WORLD.seatCount; i++) {
    const a = (i / WORLD.seatCount) * Math.PI * 2 + 0.31 + (rand() - 0.5) * 0.12;
    const r = WORLD.seatRadius + (rand() - 0.5) * 0.25;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const facing = Math.atan2(-x, -z); // yaw that looks at the fire
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = facing;
    const isLog = i % 2 === 0;
    let height;
    if (isLog) {
      const log = makeLog(props, 1.15 + rand() * 0.2, 0.19);
      log.rotation.y = (rand() - 0.5) * 0.25;
      g.add(log);
      height = 0.18;
    } else {
      const fab = fabrics[chair++ % fabrics.length];
      // A low beach-style camp chair, sized for short legs
      const seat = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.46), fab);
      seat.rotation.x = -Math.PI / 2 + 0.14; seat.position.set(0, 0.19, -0.02);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.5), fab);
      back.position.set(0, 0.42, -0.3); back.rotation.x = -0.32;
      g.add(seat, back);
      for (const sx of [-0.27, 0.27]) for (const k of [1, -1]) {
        const leg = new THREE.Mesh(legGeo, metal);
        leg.position.set(sx, 0.12, -0.02); leg.rotation.x = k * 0.75; g.add(leg);
      }
      for (const sx of [-0.27, 0.27]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.44), metal);
        arm.position.set(sx, 0.34, -0.06); g.add(arm);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.34, 5), metal);
        post.position.set(sx, 0.2, -0.27); post.rotation.x = -0.3; g.add(post);
      }
      height = 0.19;
    }
    group.add(g);
    const seat = { id: i, x, z, facing, height, kind: isLog ? 'log' : 'chair', occupant: null, mesh: g };
    // Sit a little in front of the seat's center so knees clear it
    seat.sitX = x + Math.sin(facing) * 0.04; seat.sitZ = z + Math.cos(facing) * 0.04;
    seats.push(seat);
    colliders.push({ x, z, r: 0.42, seat: i });
    g.traverse((o) => { if (o.isMesh) o.userData.seat = i; });
  }
  return { group, seats };
}

export function buildWorld(scene, props) {
  const colliders = [];
  scene.background = new THREE.Color(0x04060a);
  scene.fog = new THREE.FogExp2(0x04060a, 0.055);
  const hemi = new THREE.HemisphereLight(0x3a4c7e, 0x0a0908, 0.4);
  scene.add(hemi);

  const ground = buildGround();
  const sky = buildSky();
  const { group: seatGroup, seats } = buildSeats(props, colliders);
  const camp = buildCamp(props, colliders);
  const forest = buildForest(props, colliders);
  const grass = buildGrass(props);
  scene.add(ground, sky.group, forest, grass, seatGroup, camp);
  const blocked = (x, z, pad = 0.3) => colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + pad);
  return { ground, sky, seats, colliders, hemi, seatGroup, blocked };
}
