// ---------------------------------------------------------------------------
// The Firelight game server. One fire, up to 20 people.
//
// It keeps the shared world: how much fuel is on the fire, which twigs are
// lying around, which crates still hold marshmallows, who sits where, and
// what's on the radio. Each player's own movement comes from their browser;
// the server passes it along to everyone else ten times a second.
//
// Run:   cd server && npm install && npm start
// Then:  cloudflared tunnel --url http://localhost:8787
// Invite: https://firelight-six.vercel.app/?fire=<the trycloudflare address>
//
// Settings come from environment variables or server/config.json (see config.example.json).
// ---------------------------------------------------------------------------

import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { PROTOCOL, MAX_PLAYERS, FIRE, burn, TWIGS, CRATES, SEATS } from '../shared/rules.js';

const here = dirname(fileURLToPath(import.meta.url));
const fileConfig = existsSync(join(here, 'config.json')) ? JSON.parse(readFileSync(join(here, 'config.json'), 'utf8')) : {};
const env = (k, d) => process.env[k] ?? fileConfig[k] ?? d;
const CONFIG = {
  port: Number(env('PORT', 8787)),
  fireName: env('FIRE_NAME', 'The Fire'),
  saveDir: env('SAVE_DIR', join(here, 'saves')),
  maxPlayers: Math.min(MAX_PLAYERS, Number(env('MAX_PLAYERS', MAX_PLAYERS))),
  // Sign-in: when SUPABASE_URL and SUPABASE_ANON_KEY are set, the server checks each
  // player's Google sign-in with Supabase. ALLOW_GUESTS lets people in with just a name.
  supabaseUrl: env('SUPABASE_URL', ''),
  supabaseAnonKey: env('SUPABASE_ANON_KEY', ''),
  allowGuests: String(env('ALLOW_GUESTS', 'true')) !== 'false',
  // Owners can kick or ban (list of emails, comma separated)
  owners: String(env('OWNER_EMAILS', '')).toLowerCase().split(',').map((s) => s.trim()).filter(Boolean),
  // Browsers allowed to connect (comma separated origins); empty allows any
  origins: String(env('ALLOWED_ORIGINS', '')).split(',').map((s) => s.trim()).filter(Boolean),
};
const authOn = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);

// ---- the world ---------------------------------------------------------------
const now = () => Date.now() / 1000;
const world = {
  fuel: FIRE.startFuel,
  twigs: Array.from({ length: TWIGS.count }, () => ({ present: true, gen: 0, regrowAt: 0 })),
  crates: Array.from({ length: CRATES.count }, () => ({ full: true, refillAt: 0 })),
  seats: Array(SEATS).fill(null),          // player id or null
  radio: null,                             // { videoId, startedAt, by }
};
const bans = new Set();

if (!existsSync(CONFIG.saveDir)) mkdirSync(CONFIG.saveDir, { recursive: true });
const SAVE = join(CONFIG.saveDir, 'fire.json');
const BANS = join(CONFIG.saveDir, 'bans.json');

function load() {
  try {
    const s = JSON.parse(readFileSync(SAVE, 'utf8'));
    // The fire kept burning while the server was off
    let fuel = Number(s.fuel) || 0;
    const away = Math.min(6 * 3600, Math.max(0, now() - (s.savedAt || now())));
    for (let t = 0; t < away && fuel > 0; t += 1) fuel = burn(fuel, 1);
    world.fuel = fuel;
    if (Array.isArray(s.twigs) && s.twigs.length === TWIGS.count) world.twigs = s.twigs.map((t) => ({ present: t.present !== false, gen: t.gen | 0, regrowAt: 0 }));
    if (Array.isArray(s.crates) && s.crates.length === CRATES.count) world.crates = s.crates.map((c) => ({ full: true, refillAt: 0 }));
    console.log(`Loaded the fire: ${world.fuel.toFixed(1)} twigs of fuel after ${Math.round(away / 60)} min away.`);
  } catch { console.log('Starting a new fire.'); }
  try { for (const id of JSON.parse(readFileSync(BANS, 'utf8'))) bans.add(id); } catch { /* no bans yet */ }
}
function save() {
  const data = { fuel: world.fuel, twigs: world.twigs.map((t) => ({ present: t.present, gen: t.gen })), crates: world.crates.map((c) => ({ full: c.full })), savedAt: now() };
  try { writeFileSync(SAVE + '.tmp', JSON.stringify(data)); renameSync(SAVE + '.tmp', SAVE); } catch (e) { console.error('Could not save the fire:', e.message); }
}
load();

// ---- players -----------------------------------------------------------------
/** @type {Map<string, any>} */
const players = new Map();
const num = (v, lo, hi, d = 0) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
const LOOKS = ['rogue_hooded', 'rogue', 'barbarian', 'knight', 'mage'];
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'Friend';

function send(p, msg) { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); }
function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const p of players.values()) if (p !== except && p.joined && p.ws.readyState === 1) p.ws.send(s);
}
const publicInfo = (p) => ({ id: p.id, name: p.name, look: p.look, ai: p.ai });
const stateOf = (p) => ({ id: p.id, ...p.st });

async function checkSignIn(token) {
  const r = await fetch(`${CONFIG.supabaseUrl}/auth/v1/user`, { headers: { apikey: CONFIG.supabaseAnonKey, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return { userId: u.id, email: (u.email || '').toLowerCase(), name: u.user_metadata?.full_name || u.user_metadata?.name || (u.email || '').split('@')[0] };
}

async function hello(p, m) {
  if (m.v !== PROTOCOL) { send(p, { t: 'bye', why: 'update', text: 'The fire has been updated. Reload the page to join.' }); p.ws.close(); return; }
  let who = null;
  if (m.token && authOn) who = await checkSignIn(m.token).catch(() => null);
  if (!who && !CONFIG.allowGuests) { send(p, { t: 'bye', why: 'signin', text: 'Sign in with Google to join this fire.' }); p.ws.close(); return; }
  if (who && bans.has(who.userId)) { send(p, { t: 'bye', why: 'banned', text: "You can't join this fire." }); p.ws.close(); return; }
  if ([...players.values()].filter((x) => x.joined).length >= CONFIG.maxPlayers) { send(p, { t: 'bye', why: 'full', text: `The fire is full (${CONFIG.maxPlayers} people). Try again in a little while.` }); p.ws.close(); return; }
  p.userId = who?.userId || null;
  p.email = who?.email || '';
  p.owner = !!who && CONFIG.owners.includes(p.email);
  p.name = cleanName(who?.name || m.name);
  p.look = LOOKS.includes(m.look) ? m.look : LOOKS[0];
  p.ai = !!m.ai; // AI partners say so, and wear a mark that says so
  p.joined = true;
  p.st = { x: 0, z: 5, h: Math.PI, m: 0, s: -1, o: 0, c: 0, k: null };
  send(p, {
    t: 'welcome', id: p.id, fireName: CONFIG.fireName, owner: p.owner, signedIn: !!who,
    world: {
      fuel: world.fuel,
      twigs: world.twigs.map((t) => [t.present ? 1 : 0, t.gen]),
      crates: world.crates.map((c) => (c.full ? 1 : 0)),
      seats: world.seats,
      radio: world.radio,
    },
    players: [...players.values()].filter((x) => x.joined && x !== p).map((x) => ({ ...publicInfo(x), st: x.st })),
  });
  broadcast({ t: 'joined', p: publicInfo(p) }, p);
  console.log(`${p.name}${p.ai ? ' (AI)' : ''} sat down by the fire. ${countJoined()} here.`);
}

const countJoined = () => [...players.values()].filter((x) => x.joined).length;

function act(p, m) {
  const t = now();
  switch (m.a) {
    case 'feed': {
      if (t - (p.lastFeed || 0) < 0.25) return; // one twig at a time
      p.lastFeed = t;
      world.fuel = Math.min(FIRE.maxFuel, world.fuel + 1);
      broadcast({ t: 'ev', e: 'fed', by: p.id, stick: !!m.stick }, p);
      return;
    }
    case 'twig': {
      const tw = world.twigs[m.id | 0];
      if (!tw || !tw.present) { send(p, { t: 'ev', e: 'twigDenied', id: m.id | 0 }); return; }
      tw.present = false;
      tw.regrowAt = t + TWIGS.regrowMin + Math.random() * (TWIGS.regrowMax - TWIGS.regrowMin);
      broadcast({ t: 'ev', e: 'twigTaken', id: m.id | 0, by: p.id }, p);
      return;
    }
    case 'crate': {
      const c = world.crates[m.id | 0];
      if (!c || !c.full) { send(p, { t: 'ev', e: 'crateDenied', id: m.id | 0 }); return; }
      c.full = false;
      c.refillAt = t + CRATES.refillMin + Math.random() * (CRATES.refillMax - CRATES.refillMin);
      broadcast({ t: 'ev', e: 'crateTaken', id: m.id | 0, by: p.id }, p);
      return;
    }
    case 'sit': {
      const s = m.seat | 0;
      if (s < 0 || s >= SEATS || (world.seats[s] && world.seats[s] !== p.id)) { send(p, { t: 'ev', e: 'seatDenied', seat: s }); return; }
      freeSeat(p);
      world.seats[s] = p.id;
      broadcast({ t: 'ev', e: 'seat', seat: s, by: p.id });
      return;
    }
    case 'stand': freeSeat(p); return;
    case 'radio': {
      const id = String(m.videoId || '');
      if (!/^[\w-]{11}$/.test(id)) return;
      world.radio = { videoId: id, startedAt: Date.now(), by: p.name };
      broadcast({ t: 'ev', e: 'radio', radio: world.radio });
      return;
    }
    case 'radioOff': world.radio = null; broadcast({ t: 'ev', e: 'radio', radio: null }); return;
    case 'give': {
      const to = players.get(String(m.to));
      if (!to || !to.joined) return;
      const what = m.what === 'raw' ? 'raw' : 'roasted';
      send(to, { t: 'ev', e: 'gift', from: p.id, fromName: p.name, what, d: num(m.d, 0, 1.4) });
      broadcast({ t: 'ev', e: 'gave', from: p.id, to: to.id, what }, to);
      return;
    }
    case 'kick': {
      if (!p.owner) return;
      const who = players.get(String(m.id));
      if (!who || who === p) return;
      if (m.ban && who.userId) { bans.add(who.userId); writeFileSync(BANS, JSON.stringify([...bans])); }
      send(who, { t: 'bye', why: m.ban ? 'banned' : 'kicked', text: m.ban ? "You can't join this fire." : 'The host asked you to leave the fire.' });
      who.ws.close();
      return;
    }
    default:
  }
}

function freeSeat(p) {
  const s = world.seats.indexOf(p.id);
  if (s >= 0) { world.seats[s] = null; broadcast({ t: 'ev', e: 'seat', seat: s, by: null }); }
}

function state(p, m) {
  // Each player's own position and look of things, lightly checked
  const r = Math.hypot(+m.x || 0, +m.z || 0);
  const k = m.k && typeof m.k === 'object' ? { d: num(m.k.d, -1, 1.5, -1), b: m.k.b ? 1 : 0 } : null;
  p.st = {
    x: r > 30 ? (m.x * 30) / r : num(m.x, -30, 30), z: r > 30 ? (m.z * 30) / r : num(m.z, -30, 30),
    h: num(m.h, -100, 100), m: m.m ? 1 : 0, s: num(m.s, -1, SEATS - 1, -1) | 0,
    o: m.o ? 1 : 0, c: num(m.c, 0, TWIGS.carryMax) | 0, k,
  };
}

// ---- network -----------------------------------------------------------------
const server = http.createServer((req, res) => {
  // A tiny status page, handy for checking the tunnel works
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ fire: CONFIG.fireName, people: countJoined(), max: CONFIG.maxPlayers, fuel: Math.round(world.fuel * 10) / 10, signIn: authOn, guests: CONFIG.allowGuests }));
});
const wss = new WebSocketServer({
  server, maxPayload: 16 * 1024,
  verifyClient: ({ origin }) => !CONFIG.origins.length || CONFIG.origins.includes(origin),
});

wss.on('connection', (ws) => {
  const p = { id: randomUUID().slice(0, 8), ws, joined: false, alive: true, msgs: 0, window: now() };
  players.set(p.id, p);
  ws.on('pong', () => { p.alive = true; });
  ws.on('message', (raw) => {
    // Rate limit: a browser sends about 10 messages a second
    const t = now();
    if (t - p.window > 1) { p.window = t; p.msgs = 0; }
    if (++p.msgs > 60) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!p.joined) { if (m.t === 'hello') hello(p, m); return; }
    if (m.t === 'st') state(p, m);
    else if (m.t === 'act') act(p, m);
  });
  ws.on('close', () => {
    players.delete(p.id);
    if (!p.joined) return;
    freeSeat(p);
    broadcast({ t: 'left', id: p.id });
    console.log(`${p.name} left the fire. ${countJoined()} here.`);
  });
});

// ---- the loop ----------------------------------------------------------------
let last = now(), lastSave = now(), lastPing = now();
setInterval(() => {
  const t = now(), dt = t - last; last = t;
  world.fuel = burn(world.fuel, dt);
  world.twigs.forEach((tw, i) => {
    if (!tw.present && t >= tw.regrowAt) { tw.present = true; tw.gen++; broadcast({ t: 'ev', e: 'twigBack', id: i, gen: tw.gen }); }
  });
  world.crates.forEach((c, i) => {
    if (!c.full && t >= c.refillAt) { c.full = true; broadcast({ t: 'ev', e: 'crateBack', id: i }); }
  });
  if (players.size) broadcast({ t: 'snap', fuel: Math.round(world.fuel * 1000) / 1000, ps: [...players.values()].filter((p) => p.joined).map(stateOf) });
  if (t - lastSave > 30) { save(); lastSave = t; }
  if (t - lastPing > 15) {
    lastPing = t;
    for (const p of players.values()) { if (!p.alive) { p.ws.terminate(); continue; } p.alive = false; p.ws.ping(); }
  }
}, 100);

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(); console.log('Saved the fire. Goodnight.'); process.exit(0); });

server.listen(CONFIG.port, () => {
  console.log(`Firelight server: "${CONFIG.fireName}" on port ${CONFIG.port}`);
  console.log(`Sign-in: ${authOn ? 'Google via Supabase' : 'not set up yet'}; guests ${CONFIG.allowGuests ? 'welcome' : 'not allowed'}`);
  console.log(`Next: cloudflared tunnel --url http://localhost:${CONFIG.port}`);
});
