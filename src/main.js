import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './style.css';
import { buildWorld, groundY } from './world.js';
import { Fire, FIRE } from './fire.js';
import { Twigs, TWIGS, twigGeometry } from './twigs.js';
import { Avatar, AVATAR } from './avatar.js';
import { Camper } from './camper.js';
import { Sound } from './audio.js';
import { Radio, parseYouTube } from './radio.js';
import { Crates, Roaster, roastLabel, roastColor, CRATES } from './marshmallow.js';
import { Critters } from './critters.js';
import { Bubbles } from './remote.js';
import { fireAddress, statusAddress } from './net.js';
import { joinFire } from './multiplayer.js';
import { signInAvailable, currentUser, signInWithGoogle } from './auth.js';

const $ = (id) => document.getElementById(id);
const touch = matchMedia('(pointer: coarse)').matches;
const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
import MODELS from 'virtual:models';

// ---- renderer -------------------------------------------------------------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch || devicePixelRatio < 2, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, touch ? 1.75 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(touch ? 62 : 55, 1, 0.1, 600);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = (touch ? 62 : 55) * (w < h ? 1.18 : 1);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---- loading ----------------------------------------------------------------
const loader = new GLTFLoader();
// Normal builds fetch models from /models; the single-file preview embeds them
// in the script (some hosts block fetching even embedded files) and parses them directly.
const load = (f) => new Promise((ok, fail) => {
  const src = MODELS[f];
  if (src.startsWith('b64:')) {
    const bin = atob(src.slice(4)), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    loader.parse(buf.buffer, '', ok, fail);
  } else loader.load(src, ok, undefined, fail);
});
let look = store.get('firelight.look', AVATAR.looks[0]);
if (!AVATAR.looks.includes(look)) look = AVATAR.looks[0];

const sound = new Sound();
let game = null;

const ANIMALS = ['wolf', 'fox', 'deer'];
Promise.all([load('props.glb'), load('animations.glb'), ...ANIMALS.map((k) => load(`${k}.glb`)), ...AVATAR.looks.map((k) => load(`${k}.glb`))]).then(([props, anims, ...rest]) => {
  const animals = Object.fromEntries(ANIMALS.map((k, i) => [k, rest[i]]));
  const chars = rest.slice(ANIMALS.length);
  const models = Object.fromEntries(AVATAR.looks.map((k, i) => [k, chars[i].scene]));
  game = startGame(props.scene, anims.animations, models, animals);
  buildPicker(models);
  $('join').classList.add('ready');
}).catch((e) => {
  console.error(e);
  $('joinStatus').textContent = 'Something went wrong loading the clearing. Try reloading.';
});

// ---- the game -------------------------------------------------------------
function startGame(props, clips, models, animals) {
  const world = buildWorld(scene, props);
  const torchModel = props.getObjectByName('WoodenTorch');
  const fire = new Fire(scene);
  const radio = new Radio(scene, props, world.colliders);
  const crates = new Crates(scene, world.colliders, world.blocked);
  const twigs = new Twigs(scene, world.blocked);
  let avatar = new Avatar(scene, models[look], clips, torchModel);
  const me = new Camper({ avatar, fire, twigs, seats: world.seats, colliders: world.colliders, radio, crates });
  const roaster = new Roaster(scene, me, fire);
  const critters = new Critters(scene, animals, { fire, camper: me, sound });
  const a = Math.random() * Math.PI * 2;
  me.spawnAt(Math.cos(a) * 5.2, Math.sin(a) * 5.2);

  // Invisible target for clicking the fire
  const fireHit = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 3, 10), new THREE.MeshBasicMaterial({ visible: false }));
  fireHit.position.y = 1.2;
  scene.add(fireHit);

  // ---- camera rig ---------------------------------------------------------
  const cam = { yaw: Math.atan2(me.pos.x, me.pos.z), pitch: 0.3, dist: touch ? 5.8 : 5.2, lastDrag: -10, target: new THREE.Vector3(), pos: new THREE.Vector3() };
  cam.target.set(me.pos.x, 1.4, me.pos.z);
  const fireLook = new THREE.Vector3();

  // Seated: first person, facing the fire, free to turn and look at the people beside you.
  // Walking: third person, behind your shoulder. The camera glides between the two.
  const FP = { maxTurn: 1.9, pitchMin: -0.75, pitchMax: 0.6, pitchRest: -0.12 };
  // The aiming helper must be a camera: Object3D.lookAt points +z at the target, cameras point -z
  const eye = new THREE.Vector3(), lookAt = new THREE.Vector3(), aim = new THREE.PerspectiveCamera();
  let fpOn = false, blend = 0, wasSitting = false;

  /** Head-covering meshes hidden in first person so you see out of your own eyes. */
  function setOwnHeadVisible(v) {
    me.avatar.body.traverse((o) => { if (o.isMesh && /Head|Hat|Helmet|Hood|Cape/i.test(o.name)) o.visible = v; });
  }

  function updateCamera(dt, now) {
    if (cam.override) { camera.position.copy(cam.override.pos); camera.lookAt(cam.override.at); return; }
    const sitting = me.mode === 'sitting' && !me.standing;
    if (sitting !== wasSitting) {
      blend = 1; wasSitting = sitting;
      if (sitting) { cam.look = 0; cam.fpPitch = FP.pitchRest; if (!seen.fpLook) { seen.fpLook = true; hint(touch ? 'Drag to look around at the people by the fire.' : 'Drag to look around at the people by the fire. Press any key to stand.', 4.5); } }
    }
    blend = Math.max(0, blend - dt * 1.6);
    const k = blend > 0 ? 1 - Math.exp(-dt * 7) : 1; // glide only while switching views

    if (sitting) {
      // Eyes just in front of the head bone, looking out over the fire
      const s = me.seat;
      me.avatar.head.getWorldPosition(eye);
      const yaw = s.facing + cam.look;
      const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      eye.addScaledVector(new THREE.Vector3(Math.sin(s.facing), 0, Math.cos(s.facing)), 0.14).y += 0.2;
      const cp = Math.cos(cam.fpPitch);
      lookAt.copy(eye).add(new THREE.Vector3(fwd.x * cp, Math.sin(cam.fpPitch), fwd.z * cp));
      aim.position.copy(eye); aim.lookAt(lookAt);
      camera.position.lerp(eye, k);
      camera.quaternion.slerp(aim.quaternion, k);
      if (!fpOn && blend < 0.6) { fpOn = true; setOwnHeadVisible(false); }
      // Keep the third-person rig parked behind you so standing up glides back out
      cam.yaw = s.facing + Math.PI; cam.target.set(me.pos.x, me.pos.y + 1.45, me.pos.z);
      return;
    }
    if (fpOn) { fpOn = false; setOwnHeadVisible(true); }

    const head = new THREE.Vector3(me.pos.x, me.pos.y + 1.45, me.pos.z);
    // Drift behind the walker when they're heading somewhere on their own
    if (me.goal && me.speed > 0.5 && now - cam.lastDrag > 1.5) {
      const behind = me.heading + Math.PI;
      cam.yaw += (((behind - cam.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * (1 - Math.exp(-dt * 1.2));
    }
    cam.target.lerp(head, 1 - Math.exp(-dt * 8));
    const cp = Math.cos(cam.pitch);
    const dir = new THREE.Vector3(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    // Pull the camera in if a tree or rock stands between it and you
    let dist = cam.dist;
    for (const c of world.colliders) {
      if (c.seat != null || c.r < 0.45 || c.crate != null) continue; // only trees, rocks and the tent block the view
      const rx = c.x - cam.target.x, rz = c.z - cam.target.z;
      const along = rx * dir.x + rz * dir.z, horiz = Math.hypot(dir.x, dir.z) || 1;
      const t = along / (horiz * horiz);
      if (t <= 0 || t > dist) continue;
      const px = cam.target.x + dir.x * t - c.x, pz = cam.target.z + dir.z * t - c.z;
      if (Math.hypot(px, pz) < c.r + 0.9) dist = Math.max(2.2, t - 0.6);
    }
    cam.boom = cam.boom == null ? dist : cam.boom + (dist - cam.boom) * (1 - Math.exp(-dt * (dist < cam.boom ? 14 : 3)));
    cam.pos.copy(dir).multiplyScalar(cam.boom).add(cam.target);
    cam.pos.y = Math.max(cam.pos.y, groundY(cam.pos.x, cam.pos.z) + 0.35);
    aim.position.copy(cam.pos); aim.lookAt(cam.target);
    camera.position.lerp(cam.pos, k);
    camera.quaternion.slerp(aim.quaternion, k);
  }

  // ---- thrown twigs ---------------------------------------------------------
  const throwGeo = twigGeometry(), throwMat = new THREE.MeshLambertMaterial({ color: 0x9c7a55 });
  const flying = [];
  /** A twig arcing onto the fire. Someone else's toss (remote) only shows; the server counts it. */
  function throwTwig(fromPos, { remote = false } = {}) {
    const m = new THREE.Mesh(throwGeo, throwMat);
    m.scale.setScalar(1.6);
    scene.add(m);
    const to = fire.center.add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5));
    const from = fromPos.clone();
    const dur = 0.45 + from.distanceTo(to) * 0.05;
    flying.push({ m, from, to, t: 0, dur, remote, spin: new THREE.Vector3(Math.random() * 9, Math.random() * 4, Math.random() * 9) });
    if (!remote) sound.whoosh();
  }
  me.on((type, d) => {
    if (type === 'release') throwTwig(d.from);
    if (type === 'picked') { sound.snap(); updateTwigHud(); if (!seen.picked) { seen.picked = true; hint(touch ? 'Carry up to five. Tap the fire to toss one on.' : 'Carry up to five. Click the fire to toss one on.'); } }
    if (type === 'release') updateTwigHud();
    if (type === 'needTwigs') hint(me.torch ? 'You have no twigs. Look for them in the dark.' : `You have no twigs. Light your torch (${touch ? 'flame button' : 'F'}) and look in the dark.`);
    if (type === 'full') hint('Your arms are full. Feed the fire.');
    if (type === 'torch') $('torchBtn').classList.toggle('on', d.on);
    if (type === 'radio') openRadio();
    // Marshmallows
    if (type === 'foundMallows') { sound.creak(); updateTwigHud(); hint(seen.mallow ? `Found ${d.got} marshmallow${d.got > 1 ? 's' : ''}.` : `Found ${d.got} marshmallows! Open your pack (top left${touch ? '' : ', or I'}) to roast one on a twig.`, 5); seen.mallow = true; }
    if (type === 'crateEmpty') hint('Empty. It will be restocked by and by.');
    if (type === 'mallowsFull') hint(`Your pockets are full. You can carry ${CRATES.carryMax} marshmallows.`);
    if (type === 'needMallows') hint(seen.mallow ? 'Out of marshmallows. Look for another crate in the woods.' : 'Marshmallows are hidden in little wooden crates out in the dark. Bring your torch.', 5);
    if (type === 'needStick') hint('You need a twig for a roasting stick. Pick one up first.');
    if (type === 'roasting') { closeInventory(); updateTwigHud(); hint(touch ? 'Hold it toward the fire. Closer roasts faster, and burns sooner.' : 'Hold it toward the fire. Closer roasts faster, and burns sooner. Q to eat.', 4.5); }
    if (type === 'mallowCaught') hint('It caught fire! Blow it out quick.', 3);
    if (type === 'blewOut') { sound.puff(); hint('Phew.', 1.5); }
    if (type === 'mallowFell') hint('It slid off into the fire. Happens to everyone.', 3.5);
    if (type === 'ate') { updateTwigHud(); hint(d.from ? `From ${d.from}: ${d.line}` : d.line, 4); }
    if (type === 'busyStick') hint('Eat your marshmallow first, or put the stick away.');
    if (type === 'stickAway') updateTwigHud();
    if (type === 'received') hint(d.what === 'roasted' ? `${d.from} handed you a toasted marshmallow.` : `${d.from} gave you a marshmallow to roast.`);
    // Animals
    if (type === 'foxStole') { updateTwigHud(); hint('A fox darted in and snatched a twig! Keep your torch lit out in the dark.', 5); }
    if (type === 'tooFar') hint(`Get a little closer to ${d.to} to hand it over.`, 3);
    if (type === 'theirPocketsFull') hint(`${d.to}'s pockets are full.`, 3);
    if (type === 'gave') { closeGive(); hint(d.what === 'roasted' ? `You handed ${d.to} your marshmallow.` : `You gave ${d.to} a marshmallow to roast.`, 3); updateTwigHud(); }
    if (type === 'foxScared') { if (!seen.fox) { seen.fox = true; hint('Something scurried off into the dark.', 3); } }
  });
  function updateFlying(dt) {
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.t += dt / f.dur;
      const k = Math.min(1, f.t);
      f.m.position.lerpVectors(f.from, f.to, k);
      f.m.position.y += Math.sin(k * Math.PI) * (0.6 + f.from.distanceTo(f.to) * 0.12);
      f.m.rotation.set(f.spin.x * k, f.spin.y * k, f.spin.z * k);
      if (k >= 1) {
        scene.remove(f.m);
        flying.splice(i, 1);
        if (f.remote) { fire.flare = 1; fire.burst(28 + Math.round(fire.size * 30)); }
        else fire.addFuel(1);
        sound.landed(fire.size);
      }
    }
  }

  // ---- hints ----------------------------------------------------------------
  const seen = {};
  let hintTimer = 0;
  function hint(text, secs = 4.5) {
    const el = $('hint');
    el.textContent = text;
    el.classList.add('show');
    hintTimer = secs;
  }
  let wasEmbers = fire.isEmbers;
  fire.on((kind) => { if (kind === 'rekindled') hint('It caught. Keep it fed.'); });

  function updateTwigHud() {
    const slots = $('twigs').children;
    for (let i = 0; i < slots.length; i++) slots[i].classList.toggle('full', i < me.carrying);
    $('pack').classList.toggle('empty', me.carrying === 0 && me.mallows === 0 && !me.stick);
    $('mallowCount').textContent = me.mallows;
    $('mallows').classList.toggle('none', me.mallows === 0);
    updateInventory();
  }

  // ---- pack and roasting ------------------------------------------------------
  const invPanel = $('invPanel');
  function updateInventory() {
    $('invTwigs').textContent = me.carrying;
    $('invMallows').textContent = me.mallows;
    const canRoast = me.mallows > 0 && (me.stick ? !me.stick.mallow : me.carrying > 0);
    $('invRoast').disabled = !canRoast;
    $('invRoastNote').textContent = me.stick?.mallow ? 'You already have one on the stick.'
      : me.mallows === 0 ? 'Find marshmallows in the crates hidden in the woods.'
      : !me.stick && me.carrying === 0 ? 'You need a twig to use as a stick.'
      : me.stick ? 'Puts one on the stick you are holding.' : 'Uses one twig as the roasting stick.';
    $('invPutAway').hidden = !me.stick;
  }
  function toggleInventory() { invPanel.classList.contains('open') ? closeInventory() : (updateInventory(), invPanel.classList.add('open')); }
  function closeInventory() { invPanel.classList.remove('open'); }
  $('pack').addEventListener('click', toggleInventory);
  $('invClose').addEventListener('click', closeInventory);
  $('invRoast').addEventListener('click', () => me.roast());
  $('invPutAway').addEventListener('click', () => { me.putAwayStick(); closeInventory(); });
  invPanel.addEventListener('click', (e) => { if (e.target === invPanel) closeInventory(); });

  // The roast chip: what your marshmallow looks like right now, and what you can do
  const chip = $('roastChip'), chipColor = new THREE.Color();
  let chipKey = '';
  function updateRoastChip() {
    const m = me.stick?.mallow, t = me.treat;
    const show = !!(me.stick || t);
    chip.classList.toggle('show', show);
    if (!show) { chipKey = ''; return; }
    let label, key, swatch = '#8a6a48';
    if (t) { label = `From ${t.from}`; key = 'treat'; swatch = '#' + roastColor(t.doneness, chipColor).getHexString(); }
    else if (m) { label = roastLabel(m); key = m.burning ? 'burn' : 'roast'; swatch = '#' + roastColor(m.doneness, chipColor).getHexString(); }
    else { label = 'Empty stick'; key = me.mallows > 0 ? 'empty+' : 'empty'; }
    $('chipLabel').textContent = label;
    $('chipSwatch').style.background = swatch;
    $('chipHeat').style.opacity = m && !m.burning ? Math.min(1, (m.heat ?? 0) * 1.6) : 0;
    if (key !== chipKey) {
      chipKey = key;
      const a = $('chipA'), b = $('chipB');
      a.hidden = b.hidden = false;
      if (key === 'treat') { a.textContent = 'Eat it'; a.onclick = () => me.eatTreat(); b.hidden = true; }
      else if (key === 'burn') { a.textContent = 'Blow it out'; a.onclick = () => me.blowOut(); b.hidden = true; }
      else if (key === 'roast') { a.textContent = 'Eat'; a.onclick = () => me.eat(); b.textContent = 'Put away'; b.onclick = () => me.putAwayStick(); }
      else { a.textContent = key === 'empty+' ? 'Roast another' : 'Toss on fire'; a.onclick = key === 'empty+' ? () => me.roast() : () => me.feedFire(); b.textContent = key === 'empty+' ? 'Toss on fire' : 'Keep as twig'; b.onclick = key === 'empty+' ? () => me.feedFire() : () => me.putAwayStick(); }
    }
  }

  // ---- input ----------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const people = mp ? [...mp.remotes.values()].map((r) => r.avatar.root) : [];
    const hits = ray.intersectObjects([...people, twigs.hits, fireHit, radio.group, crates.group, world.seatGroup, world.ground], true);
    for (const h of hits) {
      if (h.object.userData.player) return { type: 'person', id: h.object.userData.player };
      if (h.object === twigs.hits) { if (twigs.items[h.instanceId].present) return { type: 'twig', id: h.instanceId }; continue; }
      if (h.object === fireHit) return { type: 'fire' };
      if (h.object.userData.radio) return { type: 'radio' };
      if (h.object.userData.crate != null) return { type: 'crate', id: h.object.userData.crate };
      if (h.object.userData.seat != null) return { type: 'seat', id: h.object.userData.seat };
      if (h.object === world.ground) return { type: 'ground', point: h.point };
    }
    return null;
  }
  function act(target) {
    if (!target) return;
    if (target.type === 'twig') me.pickTwig(target.id);
    else if (target.type === 'fire') me.feedFire();
    else if (target.type === 'seat') me.sit(target.id);
    else if (target.type === 'radio') me.useRadio();
    else if (target.type === 'crate') me.openCrate(target.id);
    else if (target.type === 'person') openGive(target.id);
    else if (target.type === 'ground') {
      if (me.mode === 'sitting') me.stand();
      else { me.walkTo(target.point.x, target.point.z); showMarker(target.point); }
    }
  }

  // A small ring where you tapped, so you know where you're headed
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 24), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  scene.add(marker);
  let markerT = 0;
  function showMarker(p) { marker.position.set(p.x, p.y + 0.03, p.z); markerT = 1; }

  const pointers = new Map();
  let drag = null, pinch = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
    if (pointers.size === 2) { const [p1, p2] = [...pointers.values()]; pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), dist: cam.dist }; drag = null; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      cam.dist = THREE.MathUtils.clamp(pinch.dist * pinch.d / Math.max(20, Math.hypot(p1.x - p2.x, p1.y - p2.y)), 2.2, 13);
      return;
    }
    if (!drag) return;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 7) {
      const k = touch ? 0.0065 : 0.0045;
      if (me.mode === 'sitting') {
        // Turn your head: left and right to the people beside you, up to the stars, down to the fire
        cam.look = THREE.MathUtils.clamp((cam.look ?? 0) + dx * k, -FP.maxTurn, FP.maxTurn);
        cam.fpPitch = THREE.MathUtils.clamp((cam.fpPitch ?? FP.pitchRest) + dy * k * 0.8, FP.pitchMin, FP.pitchMax);
      } else {
        cam.yaw -= dx * k;
        cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * k * 0.8, -0.05, 1.25);
      }
      cam.lastDrag = performance.now() / 1000;
    }
  });
  const end = (e) => {
    const wasTap = drag && drag.moved <= 7 && pointers.size === 1 && drag.button === 0;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (wasTap) act(pick(e.clientX, e.clientY));
    if (pointers.size === 0) drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); drag = null; pinch = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 2.2, 13); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (!joined || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if ((k === 'enter' || k === 't') && !e.repeat) { e.preventDefault(); openChat(); return; }
    if (k === 'b' && !e.repeat) { setBubbles(!bubblesOn); hint(bubblesOn ? 'Speech bubbles on.' : 'Speech bubbles off. What people say still shows in the chat.', 2.5); return; }
    if (k === 'f' && !e.repeat) { me.toggleTorch(); return; }
    if (k === 'm' && !e.repeat) { toggleSound(); return; }
    if (k === 'e' && !e.repeat) { me.feedFire(); return; }
    if (k === 'r' && !e.repeat) { me.roast(); return; }
    if (k === 'q' && !e.repeat) { if (me.treat) me.eatTreat(); else if (me.stick?.mallow?.burning) me.blowOut(); else me.eat(); return; }
    if (k === 'i' && !e.repeat) { toggleInventory(); return; }
    keys.add(k);
    if (me.mode === 'sitting' && !e.repeat && !['shift', 'control', 'alt', 'meta', 'tab'].includes(k)) me.stand();
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  function readKeys() {
    let f = 0, r = 0;
    if (keys.has('w') || keys.has('arrowup')) f++;
    if (keys.has('s') || keys.has('arrowdown')) f--;
    if (keys.has('d') || keys.has('arrowright')) r++;
    if (keys.has('a') || keys.has('arrowleft')) r--;
    if (!f && !r) { me.steer(0, 0); return; }
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    me.steer(fx * f - fz * r, fz * f + fx * r, keys.has('shift'));
  }

  $('torchBtn').addEventListener('click', () => me.toggleTorch());
  $('soundBtn').addEventListener('click', toggleSound);
  function toggleSound() {
    sound.setMuted(!sound.muted);
    $('soundBtn').classList.toggle('off', sound.muted);
    store.set('firelight.muted', sound.muted ? '1' : '0');
  }
  if (store.get('firelight.muted', '0') === '1') { sound.muted = true; $('soundBtn').classList.add('off'); }

  /** Lets a card be dragged by its handle; remembers where it was left. */
  function draggable(el, handle, key) {
    let start = null;
    const place = (x, y) => {
      const w = el.offsetWidth, h = el.offsetHeight;
      el.style.left = `${THREE.MathUtils.clamp(x, 8, innerWidth - w - 8)}px`;
      el.style.top = `${THREE.MathUtils.clamp(y, 8, innerHeight - h - 8)}px`;
      el.style.right = 'auto'; el.style.bottom = 'auto';
    };
    try { const p = JSON.parse(store.get(key, 'null')); if (p) requestAnimationFrame(() => place(p.x * innerWidth, p.y * innerHeight)); } catch { /* no saved spot */ }
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      start = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop };
      handle.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
    });
    handle.addEventListener('pointermove', (e) => { if (start) place(start.l + e.clientX - start.x, start.t + e.clientY - start.y); });
    const end = () => {
      if (!start) return;
      start = null; el.classList.remove('dragging');
      store.set(key, JSON.stringify({ x: el.offsetLeft / innerWidth, y: el.offsetTop / innerHeight }));
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    addEventListener('resize', () => { if (el.style.left) place(el.offsetLeft, el.offsetTop); });
  }

  // ---- radio panel ------------------------------------------------------------
  const panel = $('radioPanel'), input = $('radioLink'), status = $('radioStatus');
  function openRadio() {
    panel.classList.add('open');
    const others = !!mp;
    status.textContent = radio.tunedOut && radio.videoId ? (others ? `Still playing for everyone else${radio.title ? `: ${radio.title}` : ''}.` : 'The radio is still on. Tune back in to hear it.')
      : radio.playing ? `Playing: ${radio.title}` : 'Paste a YouTube link to put on a song.';
    $('radioTuneIn').hidden = !(radio.tunedOut && radio.videoId);
    $('radioOff').disabled = !radio.videoId;
    $('radioOff').textContent = others ? 'Turn the radio off for everyone' : 'Turn the radio off';
    if (!touch) setTimeout(() => input.focus(), 50);
  }
  function closeRadio() { panel.classList.remove('open'); input.blur(); }
  function playLink() {
    const id = parseYouTube(input.value);
    if (!id) { status.textContent = "That doesn't look like a YouTube link."; return; }
    radio.play(id);
    $('radioOff').disabled = false;
    input.value = '';
  }
  $('radioPlay').addEventListener('click', playLink);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') playLink(); if (e.key === 'Escape') closeRadio(); e.stopPropagation(); });
  $('radioClose').addEventListener('click', closeRadio);
  $('radioOff').addEventListener('click', () => { radio.stop(); });
  $('radioTuneIn').addEventListener('click', () => { radio.tuneIn(); });
  // The card's ✕ stops the song for you only; everyone else keeps listening
  $('npOff').addEventListener('click', () => radio.tuneOut());
  draggable($('nowPlaying'), document.querySelector('#nowPlaying .np-head'), 'firelight.npPos');
  radio.on((type, d) => {
    const np = $('nowPlaying');
    if (type === 'loading') { status.textContent = 'Tuning in…'; np.classList.add('show'); $('npTitle').textContent = 'Tuning in…'; }
    if (type === 'playing') { status.textContent = `Playing: ${d.title}`; $('npTitle').textContent = d.title || 'On the radio'; np.classList.add('show'); setTimeout(closeRadio, 900); }
    if (type === 'error') { status.textContent = d.message; $('npTitle').textContent = 'Nothing playing'; np.classList.remove('show'); }
    if (type === 'stopped' || type === 'ended') { status.textContent = 'The radio is off.'; np.classList.remove('show'); $('radioOff').disabled = true; $('radioTuneIn').hidden = true; }
    if (type === 'tunedOut') { np.classList.remove('show'); hint(mp ? "The radio's off for you. Everyone else still hears it. Tap the radio to tune back in." : 'Tap the radio to tune back in.', 5); }
  });

  // ---- loop -------------------------------------------------------------------
  let joined = false;
  const clock = new THREE.Timer();
  let fpsAcc = 0, fpsN = 0, fpsCheckAt = 4;
  let time = 0;

  function step(dt) {
    time += dt;
    if (joined) readKeys();
    fire.update(dt);
    twigs.update(dt);
    me.update(dt);
    updateFlying(dt);
    radio.update(dt, me.pos, sound.muted);
    crates.update(dt);
    roaster.update(dt);
    critters.update(dt, camera);
    updateRoastChip();
    mp?.update(dt);
    bubbles.update(dt, bubbleAt);
    world.sky.update(dt, time, Math.min(1, fire.size * 1.15));
    world.hemi.intensity = 0.32 + 0.4 * (1 - Math.min(1, fire.size * 1.4)); // moonlight reads more when the fire is low
    if (markerT > 0) { markerT = Math.max(0, markerT - dt * 1.4); marker.material.opacity = markerT * 0.8; marker.scale.setScalar(1 + (1 - markerT) * 0.6); }
    if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) $('hint').classList.remove('show'); }
    if (fire.isEmbers && !wasEmbers) hint(touch ? 'The fire has burned down to embers. Toss a twig on to bring it back.' : 'The fire has burned down to embers. Toss a twig on to bring it back.', 6);
    wasEmbers = fire.isEmbers;
  }

  function frame() {
    clock.update();
    const dt = Math.min(0.05, clock.getDelta());
    step(dt);
    updateCamera(dt, performance.now() / 1000);
    sound.update(dt, camera, fire.size, fire.isEmbers);
    fire.sparks.material.uniforms.uPx.value = renderer.getPixelRatio() * innerHeight / 900;
    world.sky.uniforms.uPx.value = renderer.getPixelRatio();
    critters.flyU.uPx.value = renderer.getPixelRatio();
    renderer.render(scene, camera);
    // Adaptive resolution: if a phone struggles, render fewer pixels
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= fpsCheckAt) {
      const fps = fpsN / fpsAcc;
      if (fps < 40 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.35); renderer.setPixelRatio(pixelRatio); resize(); }
      fpsAcc = 0; fpsN = 0; fpsCheckAt = 3;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- chat: speech bubbles and a small log ------------------------------------------
  const bubbles = new Bubbles(scene);
  // Each person chooses whether they see speech bubbles; the chat log always shows what was said
  let bubblesOn = store.get('firelight.bubbles', '1') !== '0';
  function setBubbles(on) {
    bubblesOn = on;
    store.set('firelight.bubbles', on ? '1' : '0');
    const b = $('bubbleToggle');
    b.textContent = on ? 'Bubbles on' : 'Bubbles off';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.classList.toggle('off', !on);
    if (!on) for (const key of [...bubbles.map.keys()]) bubbles.clear(key);
  }
  setBubbles(bubblesOn);
  $('bubbleToggle').addEventListener('click', () => { setBubbles(!bubblesOn); chatInput.focus(); });
  const chatLog = $('chatLog'), chatBar = $('chatBar'), chatInput = $('chatInput');
  function logLine({ name, text, ai, note, mine }) {
    const el = document.createElement('div');
    el.className = `line${note ? ' note' : ''}${mine ? ' mine' : ''}`;
    if (!note) { const n = document.createElement('b'); n.textContent = `${ai ? 'ב ' : ''}${name}`; if (ai) n.className = 'ai'; el.append(n, ' '); }
    el.append(document.createTextNode(text));
    chatLog.append(el);
    while (chatLog.children.length > 40) chatLog.firstChild.remove();
    chatLog.scrollTop = chatLog.scrollHeight;
    // Each line fades on its own after a while; opening chat shows them all again
    setTimeout(() => el.classList.add('old'), 14000);
  }
  function openChat() { if (!joined) return; chatBar.classList.add('open'); chatLog.classList.add('open'); document.body.classList.add('chatting'); chatInput.focus(); }
  function closeChat() { chatBar.classList.remove('open'); chatLog.classList.remove('open'); document.body.classList.remove('chatting'); chatInput.blur(); }
  function sendChat() {
    const text = chatInput.value.trim();
    if (!text) { closeChat(); return; }
    me.say(text);
    chatInput.value = '';
    if (touch) closeChat();
  }
  me.on((type, d) => {
    if (type !== 'say') return;
    if (bubblesOn) bubbles.show('me', d.text, false);
    logLine({ name: me.name || 'You', text: d.text, mine: true });
  });
  $('chatBtn').addEventListener('click', () => (chatBar.classList.contains('open') ? closeChat() : openChat()));
  $('chatSend').addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
    if (e.key === 'Escape') closeChat();
  });
  const bubblePos = new THREE.Vector3();
  function bubbleAt(key) {
    if (key === 'me') { if (fpOn) return null; const p = me.avatar.root.position; return bubblePos.set(p.x, p.y + 2.45, p.z); }
    const r = mp?.remotes.get(key);
    return r ? bubblePos.set(r.pos.x, r.pos.y + 2.45, r.pos.z) : null;
  }
  const onSaid = (m) => {
    if (m.note) { logLine({ text: m.text, note: true }); return; }
    if (m.by && bubblesOn) bubbles.show(m.by, m.text, m.ai);
    logLine({ name: m.name, text: m.text, ai: m.ai });
  };
  const onChatHistory = (lines) => { chatLog.innerHTML = ''; for (const l of lines) onSaid({ ...l, by: null }); };

  // ---- give a marshmallow to someone -----------------------------------------
  const givePanel = $('givePanel');
  let giveTo = null;
  function openGive(id) {
    const r = mp?.remotes.get(id);
    if (!r) return;
    giveTo = id;
    $('giveName').textContent = r.name;
    const roasted = me.stick?.mallow && !me.stick.mallow.burning;
    $('giveRoasted').disabled = !roasted;
    $('giveRaw').disabled = me.mallows <= 0;
    $('giveNote').textContent = roasted || me.mallows > 0 ? `Stand close to ${r.name} to hand it over.` : 'Find marshmallows in the crates hidden in the woods.';
    givePanel.classList.add('open');
  }
  function closeGive() { givePanel.classList.remove('open'); giveTo = null; }
  $('giveRoasted').addEventListener('click', () => { const p = mp?.personFor(giveTo); if (p) me.give(p, 'roasted'); });
  $('giveRaw').addEventListener('click', () => { const p = mp?.personFor(giveTo); if (p) me.give(p, 'raw'); });
  $('giveClose').addEventListener('click', closeGive);
  givePanel.addEventListener('click', (e) => { if (e.target === givePanel) closeGive(); });

  // ---- join -----------------------------------------------------------------
  const fireURL = fireAddress();
  let mp = null;
  let user = null;
  const nameInput = $('joinName');
  nameInput.value = store.get('firelight.name', '');
  function showCount(n, name) {
    $('people').hidden = false;
    $('peopleCount').textContent = n === 1 ? 'Just you' : `${n} at the fire`;
    if (name) $('people').title = name;
  }

  async function prepareJoin() {
    if (!fireURL) return; // single player: the card stays as it is
    $('join').classList.add('shared');
    $('joinBtn').textContent = 'Join the fire';
    if (signInAvailable) {
      user = await currentUser().catch(() => null);
      $('googleBtn').hidden = !!user;
      if (user) $('joinWho').textContent = `Signed in as ${user.name}`;
    }
    $('joinNameRow').hidden = !!user;
    try {
      const r = await fetch(statusAddress(fireURL), { cache: 'no-store' });
      const st = await r.json();
      $('joinFire').textContent = st.people ? `${st.fire}: ${st.people} ${st.people === 1 ? 'person' : 'people'} by the fire` : `${st.fire}: nobody here yet`;
      if (!st.guests && !user) { $('joinNameRow').hidden = true; $('joinBtn').disabled = true; $('joinWho').textContent = 'This fire asks you to sign in with Google.'; }
    } catch {
      $('joinFire').textContent = "Can't reach that fire right now. You can still sit by one of your own.";
    }
  }
  prepareJoin();
  $('googleBtn').addEventListener('click', () => signInWithGoogle());

  let goSolo = false; // after a failed join, the button offers a fire of your own instead
  async function join() {
    if (joined) return;
    if (fireURL && !mp && !goSolo) {
      const name = (user?.name || nameInput.value).trim();
      if (!name) { nameInput.focus(); $('joinWho').textContent = 'Tell everyone your name first.'; return; }
      store.set('firelight.name', name);
      me.name = name;
      $('joinBtn').disabled = true;
      $('joinBtn').textContent = 'Walking to the fire…';
      try {
        mp = await joinFire(fireURL, {
          scene, me, fire, twigs, crates, seats: world.seats, radio, sound, hint, throwTwig, models, clips, torchModel,
          hello: { name, look, token: user?.token },
          onCount: showCount, onInventory: updateTwigHud, onSaid, onChatHistory,
        });
        window.__firelight.mp = mp;
      } catch (e) {
        $('joinBtn').disabled = false;
        $('joinBtn').textContent = 'Sit by your own fire';
        goSolo = !e.bye || ['full', 'update'].includes(e.bye.why) ? true : goSolo;
        $('joinWho').textContent = e.bye ? e.bye.text : "Couldn't reach the fire. Check the link, or sit by your own fire for now.";
        return;
      }
    }
    joined = true;
    if (goSolo) setTimeout(() => hint("You're at a fire of your own. The shared fire is offline right now.", 5), 7500);
    sound.start();
    if (sound.muted) sound.setMuted(true);
    $('join').classList.add('gone');
    $('hud').classList.add('show');
    updateTwigHud();
    setTimeout(() => hint(touch ? 'Light your torch and gather twigs in the dark. Tap the fire to feed it.' : 'Light your torch (F) and gather twigs in the dark. Click the fire to feed it.', 6), 1200);
  }
  $('joinBtn').addEventListener('click', join);
  nameInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') join(); });

  function setLook(key) {
    if (key === look) return;
    look = key;
    store.set('firelight.look', key);
    const old = me.avatar;
    const fresh = new Avatar(scene, models[key], clips, torchModel);
    fresh.setTorch(me.torch); fresh.setCarrying(me.carrying);
    fresh.bundle.visible = !me.stick && me.carrying > 0;
    fresh.root.position.copy(old.root.position); fresh.root.rotation.copy(old.root.rotation);
    old.dispose(scene);
    me.avatar = fresh;
  }

  // Test hook for automated checks; harmless in production
  window.__firelight = {
    fire, me, twigs, world, cam, radio, crates, roaster, critters, FIRE, TWIGS,
    advance(seconds, step_ = 1 / 30) { for (let t = 0; t < seconds; t += step_) step(step_); },
    setFuel(f) { fire.fuel = f; fire.size = Math.min(1.15, Math.sqrt(f / FIRE.bonfireFuel)); },
    join,
  };
  return { setLook, join };
}

// ---- avatar picker on the join card -----------------------------------------
function buildPicker() {
  const wrap = $('looks');
  const names = { rogue_hooded: 'Hooded', rogue: 'Rogue', barbarian: 'Barbarian', knight: 'Knight', mage: 'Mage' };
  for (const k of AVATAR.looks) {
    const b = document.createElement('button');
    b.className = 'look' + (k === look ? ' on' : '');
    b.textContent = names[k];
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.look').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      game.setLook(k);
    });
    wrap.appendChild(b);
  }
}
