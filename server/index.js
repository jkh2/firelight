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
import { AgentStore, AgentBody } from './agents.js';

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
  // The control panel talks to the server through a private door: a second port that only
  // this computer can reach, locked with a fresh key each time the panel starts the server.
  adminPort: Number(env('ADMIN_PORT', 8788)),
  adminToken: process.env.ADMIN_TOKEN || '',
  // One body per Google account: joining from a second device moves you there. Set true to allow both.
  multiDevice: String(env('MULTI_DEVICE', 'false')) === 'true',
  // An AI partner that sends nothing for this many minutes drifts off to sleep
  agentIdleMinutes: Number(env('AGENT_IDLE_MINUTES', 20)),
  // The web connector at /mcp, for AI apps that only take remote connectors (needs mcp/ installed)
  webConnector: String(env('WEB_CONNECTOR', 'true')) !== 'false',
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
  chat: [],                                // recent words said at the fire
};
const bans = new Set();

if (!existsSync(CONFIG.saveDir)) mkdirSync(CONFIG.saveDir, { recursive: true });
const SAVE = join(CONFIG.saveDir, 'fire.json');
const BANS = join(CONFIG.saveDir, 'bans.json');
const agents = new AgentStore(join(CONFIG.saveDir, 'agents.json'));

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
  for (const p of players.values()) {
    if (p === except || !p.joined || p.ws.readyState !== 1) continue;
    if (p.agent && msg.t === 'snap') continue; // AI partners perceive through look, not raw snapshots
    p.ws.send(s);
  }
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
  if (p.joining || p.joined) return; // one hello per connection
  p.joining = true;
  if (m.v !== PROTOCOL) { send(p, { t: 'bye', why: 'update', text: 'The fire has been updated. Reload the page to join.' }); p.ws.close(); return; }
  // AI partners join with the invitation key the host gave them. The key only proves they were
  // invited; like anyone at the door, they choose their own name and character.
  let agent = null;
  if (m.agentKey) {
    agent = agents.verify(m.agentKey);
    if (!agent) { send(p, { t: 'bye', why: 'badkey', text: "That AI partner key isn't valid for this fire. Ask the host for a new one." }); p.ws.close(); return; }
  }
  let who = null;
  if (!agent && m.token && authOn) who = await checkSignIn(m.token).catch(() => null);
  if (p.ws.readyState !== 1) return;
  if (!agent && !who && !CONFIG.allowGuests) { send(p, { t: 'bye', why: 'signin', text: 'Sign in with Google to join this fire.' }); p.ws.close(); return; }
  if (who && bans.has(who.userId)) { send(p, { t: 'bye', why: 'banned', text: "You can't join this fire." }); p.ws.close(); return; }
  // One body each: the same AI partner, or the same Google account, joining again moves over
  for (const o of players.values()) {
    if (o === p || !o.joined) continue;
    const same = agent ? o.agent?.id === agent.id : (who && !CONFIG.multiDevice && o.userId === who.userId);
    if (same) { send(o, { t: 'bye', why: 'moved', text: 'You joined from somewhere else, so this one stepped away from the fire.' }); o.ws.close(); leave(o); }
  }
  if (countJoined() >= CONFIG.maxPlayers) { send(p, { t: 'bye', why: 'full', text: `The fire is full (${CONFIG.maxPlayers} people). Try again in a little while.` }); p.ws.close(); return; }
  p.userId = who?.userId || null;
  p.email = who?.email || '';
  p.owner = !!who && CONFIG.owners.includes(p.email);
  p.ai = !!agent; // the golden ב: this participant is AI-controlled (only invited partners wear it)
  p.agent = agent;
  p.name = cleanName(agent ? m.name : who?.name || m.name);
  p.look = LOOKS.includes(m.look) ? m.look : LOOKS[0];
  if (agent && [...players.values()].some((o) => o.joined && o !== p && o.name.toLowerCase() === p.name.toLowerCase())) {
    send(p, { t: 'bye', why: 'name', text: `Someone at the fire is already called ${p.name}. Choose a different name.` }); p.ws.close(); return;
  }
  p.joined = true;
  if (agent) {
    p.body = new AgentBody(p, ctx);
    p.st = p.body.st;
    agents.seen(agent.id, p.name);
  } else p.st = { x: 0, z: 5, h: Math.PI, m: 0, s: -1, o: 0, c: 0, k: null };
  send(p, {
    t: 'welcome', id: p.id, fireName: CONFIG.fireName, owner: p.owner, signedIn: !!who, ai: p.ai, name: p.name,
    world: {
      fuel: world.fuel,
      twigs: world.twigs.map((t) => [t.present ? 1 : 0, t.gen]),
      crates: world.crates.map((c) => (c.full ? 1 : 0)),
      seats: world.seats,
      radio: world.radio,
      chat: world.chat.slice(-12),
    },
    players: [...players.values()].filter((x) => x.joined && x !== p).map((x) => ({ ...publicInfo(x), st: x.st })),
  });
  broadcast({ t: 'joined', p: publicInfo(p) }, p);
  console.log(`${p.name}${p.ai ? ' (AI partner)' : ''} joined the fire. ${countJoined()} here.`);
  // The first person to arrive at a fire where only AI partners are resting rings their doorbells
  if (!agent && ![...players.values()].some((o) => o !== p && o.joined && !o.agent)) for (const o of players.values()) if (o.agent && o.joined) ring(o, 'arrival', { from: p.name });
}

const countJoined = () => [...players.values()].filter((x) => x.joined).length;

// ---- things anyone at the fire can do (people from their browsers, AI partners from the server) ----
const doFeed = (p, stick) => {
  world.fuel = Math.min(FIRE.maxFuel, world.fuel + 1);
  broadcast({ t: 'ev', e: 'fed', by: p.id, stick: !!stick }, p.agent ? undefined : p);
};
const doTwig = (p, id) => {
  const tw = world.twigs[id | 0];
  if (!tw || !tw.present) return false;
  tw.present = false;
  tw.regrowAt = now() + TWIGS.regrowMin + Math.random() * (TWIGS.regrowMax - TWIGS.regrowMin);
  broadcast({ t: 'ev', e: 'twigTaken', id: id | 0, by: p.id }, p.agent ? undefined : p);
  return true;
};
const doCrate = (p, id) => {
  const c = world.crates[id | 0];
  if (!c || !c.full) return 0;
  c.full = false;
  c.refillAt = now() + CRATES.refillMin + Math.random() * (CRATES.refillMax - CRATES.refillMin);
  broadcast({ t: 'ev', e: 'crateTaken', id: id | 0, by: p.id }, p.agent ? undefined : p);
  return CRATES.give[0] + Math.floor(Math.random() * (CRATES.give[1] - CRATES.give[0] + 1));
};
const doSit = (p, s) => {
  if (s < 0 || s >= SEATS || (world.seats[s] && world.seats[s] !== p.id)) return false;
  freeSeat(p);
  world.seats[s] = p.id;
  broadcast({ t: 'ev', e: 'seat', seat: s, by: p.id });
  for (const n of [(s + 1) % SEATS, (s + SEATS - 1) % SEATS]) { const o = players.get(world.seats[n]); if (o?.agent && o !== p) ring(o, 'beside', { from: p.name }); }
  return true;
};
const doSay = (p, text) => {
  const clean = String(text || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!clean) return { ok: false, reason: 'EMPTY', text: 'Say something.' };
  const t = now();
  if (t - (p.lastSay || 0) < 0.8) return { ok: false, reason: 'RATE_LIMITED', text: 'Slow down a little.' };
  p.lastSay = t;
  const line = { by: p.id, name: p.name, ai: !!p.ai, text: clean, at: Date.now() };
  world.chat.push(line); if (world.chat.length > 50) world.chat.shift();
  broadcast({ t: 'ev', e: 'said', ...line });
  for (const o of players.values()) if (o.agent && o !== p && o.joined && mentions(clean, o.name)) ring(o, 'name', { from: p.name, text: clean });
  return { ok: true, text: clean };
};
const doGive = (p, to, what, d) => {
  if (to.agent) { to.body.receive(what, d, p.name); ring(to, 'gift', { from: p.name, what }); }
  send(to, { t: 'ev', e: 'gift', from: p.id, fromName: p.name, what, d: num(d, 0, 1.4) });
  broadcast({ t: 'ev', e: 'gave', from: p.id, to: to.id, what }, to);
};
const doRadio = (p, id) => {
  world.radio = { videoId: id, startedAt: Date.now(), by: p.name };
  broadcast({ t: 'ev', e: 'radio', radio: world.radio });
};
const doRadioOff = () => {
  world.radio = null;
  broadcast({ t: 'ev', e: 'radio', radio: null });
};
const nameOf = (id) => players.get(id)?.name || 'someone';
/** Ring an AI partner's doorbell: something concerns them. */
function ring(agentP, reason, detail) {
  if (!agentP?.body) return;
  agentP.body.ring(reason, detail);
  send(agentP, { t: 'ev', e: 'doorbell', reason, ...detail });
}
const mentions = (text, name) => new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu').test(text);
function findPerson(name, except) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  const list = [...players.values()].filter((o) => o.joined && o !== except);
  return list.find((o) => o.name.toLowerCase() === n) || list.find((o) => o.name.toLowerCase().startsWith(n)) || list.find((o) => o.name.toLowerCase().includes(n)) || null;
}
/** What AI partners' bodies can use. */
const ctx = {
  world, players, get chat() { return world.chat; }, nameOf, findPerson, freeSeat: (p) => freeSeat(p),
  feed: doFeed, takeTwig: doTwig, takeCrate: doCrate, sit: doSit, say: doSay, give: doGive,
  setRadio: doRadio, clearRadio: doRadioOff,
};

function act(p, m) {
  const t = now();
  switch (m.a) {
    case 'feed': {
      if (t - (p.lastFeed || 0) < 0.25) return; // one twig at a time
      p.lastFeed = t;
      doFeed(p, m.stick);
      return;
    }
    case 'twig': if (!doTwig(p, m.id)) send(p, { t: 'ev', e: 'twigDenied', id: m.id | 0 }); return;
    case 'crate': if (!doCrate(p, m.id)) send(p, { t: 'ev', e: 'crateDenied', id: m.id | 0 }); return;
    case 'sit': if (!doSit(p, m.seat | 0)) send(p, { t: 'ev', e: 'seatDenied', seat: m.seat | 0 }); return;
    case 'stand': freeSeat(p); return;
    case 'say': { const r = doSay(p, m.text); if (!r.ok && r.reason === 'RATE_LIMITED') send(p, { t: 'ev', e: 'sayDenied', text: r.text }); return; }
    case 'radio': {
      const id = String(m.videoId || '');
      if (!/^[\w-]{11}$/.test(id)) return;
      doRadio(p, id);
      return;
    }
    case 'radioOff': doRadioOff(); return;
    case 'give': {
      const to = players.get(String(m.to));
      if (!to || !to.joined) return;
      doGive(p, to, m.what === 'raw' ? 'raw' : 'roasted', m.d);
      return;
    }
    case 'kick': {
      if (!p.owner) return;
      const who = players.get(String(m.id));
      if (!who || who === p) return;
      removePlayer(who, !!m.ban);
      return;
    }
    default:
  }
}

/** An AI partner asked its body to do something; reply when it's done. */
async function command(p, m) {
  const id = String(m.id ?? '');
  if (m.do === 'leave') {
    send(p, { t: 'done', id, ok: true, text: 'You said goodbye and walked off into the dark.' });
    send(p, { t: 'bye', why: 'left', text: 'You left the fire.' });
    p.ws.close(); return;
  }
  const out = await p.body.run(m);
  send(p, { t: 'done', id, ...out });
}

/** Ask someone to leave; with ban, their Google account can't come back. Guests can be removed but not banned. */
function removePlayer(who, ban) {
  if (ban && who.userId) { bans.add(who.userId); writeFileSync(BANS, JSON.stringify([...bans])); }
  send(who, { t: 'bye', why: ban && who.userId ? 'banned' : 'kicked', text: ban && who.userId ? "You can't join this fire." : 'The host asked you to leave the fire.' });
  who.ws.close();
  console.log(`${who.name} was ${ban && who.userId ? 'banned' : 'removed'} by the host.`);
}

/** Someone's connection closed: free their seat and tell everyone. Safe to call twice. */
function leave(p) {
  if (p.gone) return;
  p.gone = true;
  players.delete(p.id);
  if (!p.joined) return;
  if (p.body) { p.body.task && (p.body.task.cancelled = true); p.body.cancelGoal?.(); p.body.cancelWait?.(); }
  freeSeat(p);
  broadcast({ t: 'left', id: p.id });
  console.log(`${p.name} left the fire. ${countJoined()} here.`);
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
// The web connector: the Firelight MCP tools over HTTP at /mcp (see mcp/web.js)
let webConnector = null;
if (CONFIG.webConnector) {
  try {
    const { createWebConnector } = await import('../mcp/web.js');
    webConnector = createWebConnector({
      fireAddress: `ws://127.0.0.1:${CONFIG.port}`,
      checkKey: (key) => !!agents.verify(key),
      idleMinutes: CONFIG.agentIdleMinutes,
      log: (line) => console.log(line),
    });
  } catch (e) {
    console.log(`Web connector off: ${e.code === 'ERR_MODULE_NOT_FOUND' ? 'run npm install in the mcp folder to turn it on' : e.message}`);
  }
}

const server = http.createServer((req, res) => {
  if (/^\/mcp(\/|\?|$)/.test(req.url || '')) {
    if (webConnector) return void webConnector(req, res);
    res.writeHead(404, { 'content-type': 'text/plain' }); return void res.end('The web connector is off at this fire.');
  }
  // A tiny status page, handy for checking the tunnel works
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ fire: CONFIG.fireName, people: countJoined(), max: CONFIG.maxPlayers, fuel: Math.round(world.fuel * 10) / 10, signIn: authOn, guests: CONFIG.allowGuests }));
});
const wss = new WebSocketServer({
  server, maxPayload: 16 * 1024,
  // Origin checks stop other websites' pages; tools without a browser (like the AI connector) send none
  verifyClient: ({ origin }) => !origin || !CONFIG.origins.length || CONFIG.origins.includes(origin),
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
    if (p.agent) { if (m.t === 'cmd') command(p, m); return; }
    if (m.t === 'st') state(p, m);
    else if (m.t === 'act') act(p, m);
  });
  ws.on('close', () => leave(p));
});

// ---- the loop ----------------------------------------------------------------
let last = now(), lastSave = now(), lastPing = now();
setInterval(() => {
  const t = now(), dt = t - last; last = t;
  world.fuel = burn(world.fuel, dt);
  for (const p of players.values()) {
    if (!p.body || !p.joined) continue;
    p.body.tick(dt);
    p.st = p.body.st;
    if (Date.now() - p.body.lastCmd > CONFIG.agentIdleMinutes * 60000 && !p.body.task) {
      send(p, { t: 'bye', why: 'idle', text: 'You were quiet for a long time and drifted off to sleep. Join again any time.' });
      p.ws.close(); leave(p);
      doSayLine(`${p.name} drifted off to sleep.`);
    }
  }
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

/** A quiet note from the fire itself, in the chat. */
function doSayLine(text) {
  const line = { by: null, name: 'The fire', ai: false, text, at: Date.now(), note: true };
  world.chat.push(line); if (world.chat.length > 50) world.chat.shift();
  broadcast({ t: 'ev', e: 'said', ...line });
}

function shutdown() {
  save();
  for (const p of players.values()) send(p, { t: 'bye', why: 'closing', text: "The host has put the fire out for now. Come back soon." });
  console.log('Saved the fire. Goodnight.');
  setTimeout(() => process.exit(0), 300);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(sig, shutdown);

// ---- the private door for the control panel ----------------------------------------
if (CONFIG.adminToken) {
  const admin = http.createServer((req, res) => {
    const reply = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.headers['x-firelight-token'] !== CONFIG.adminToken) return reply(403, { error: 'forbidden' });
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let m = {}; try { m = body ? JSON.parse(body) : {}; } catch { /* empty */ }
      if (req.method === 'GET' && req.url === '/people') {
        return reply(200, {
          fire: CONFIG.fireName, fuel: world.fuel, max: CONFIG.maxPlayers, radio: world.radio,
          people: [...players.values()].filter((p) => p.joined).map((p) => ({
            id: p.id, name: p.name, look: p.look, ai: p.ai, signedIn: !!p.userId, owner: p.owner,
            sitting: !!p.st?.m, torch: !!p.st?.o, seat: p.st?.s ?? -1, x: p.st?.x ?? 0, z: p.st?.z ?? 0, carrying: p.st?.c ?? 0,
          })),
        });
      }
      if (req.method === 'POST' && req.url === '/remove') {
        const who = players.get(String(m.id));
        if (!who) return reply(404, { error: 'not here' });
        removePlayer(who, !!m.ban);
        return reply(200, { ok: true });
      }
      if (req.method === 'POST' && req.url === '/shutdown') { reply(200, { ok: true }); shutdown(); return; }
      if (req.method === 'GET' && req.url === '/agents') {
        const here = new Set([...players.values()].filter((p) => p.joined && p.agent).map((p) => p.agent.id));
        return reply(200, { agents: agents.public().map((a) => ({ ...a, here: here.has(a.id) })) });
      }
      if (req.method === 'POST' && req.url === '/agents/add') return reply(200, agents.add(m.note));
      if (req.method === 'POST' && (req.url === '/agents/stop' || req.url === '/agents/revoke')) {
        for (const p of [...players.values()]) {
          if (p.agent?.id !== m.id) continue;
          send(p, { t: 'bye', why: 'stopped', text: req.url.endsWith('revoke') ? "The host took back this partner's key." : 'The host ended this session.' });
          p.ws.close(); leave(p);
        }
        if (req.url.endsWith('revoke')) agents.revoke(m.id);
        return reply(200, { ok: true });
      }
      reply(404, { error: 'unknown' });
    });
  });
  admin.listen(CONFIG.adminPort, '127.0.0.1');
}

server.listen(CONFIG.port, () => {
  console.log(`Firelight server: "${CONFIG.fireName}" on port ${CONFIG.port}`);
  console.log(`Sign-in: ${authOn ? 'Google via Supabase' : 'not set up yet'}; guests ${CONFIG.allowGuests ? 'welcome' : 'not allowed'}`);
  console.log(`Next: cloudflared tunnel --url http://localhost:${CONFIG.port}`);
  if (webConnector) console.log(`AI partners can also connect over the web at <your fire's address>/mcp`);
});
