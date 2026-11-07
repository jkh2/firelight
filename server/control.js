// ---------------------------------------------------------------------------
// The Firelight control panel. Double-click "Firelight" (Firelight.cmd) and
// this opens a small page in your browser where you light the fire or put it
// out, copy the invite link, and see who's gathered.
//
// It runs the game server and the Cloudflare tunnel for you, and reads the
// tunnel's address so the invite link is ready to copy. The panel lives at
// http://localhost:8790 and only this computer can open it.
// ---------------------------------------------------------------------------

import http from 'node:http';
import { spawn, exec } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { AgentStore } from './agents.js';

const here = dirname(fileURLToPath(import.meta.url));
const fileConfig = existsSync(join(here, 'config.json')) ? JSON.parse(readFileSync(join(here, 'config.json'), 'utf8')) : {};
const env = (k, d) => process.env[k] ?? fileConfig[k] ?? d;
const cloudflaredDefault = process.platform === 'win32'
  ? [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
    .filter(Boolean).map((p) => join(p, 'cloudflared', 'cloudflared.exe')).find(existsSync) || 'cloudflared'
  : 'cloudflared';
const CFG = {
  panelPort: Number(env('CONTROL_PORT', 8790)),
  gamePort: Number(env('PORT', 8787)),
  adminPort: Number(env('ADMIN_PORT', 8788)),
  site: String(env('PUBLIC_SITE', 'https://firelight-six.vercel.app')).replace(/\/$/, ''),
  cloudflared: env('CLOUDFLARED', cloudflaredDefault),
  // A permanent address, once you have a named tunnel on your own domain:
  tunnelName: env('TUNNEL_NAME', ''),
  publicHost: env('PUBLIC_HOST', ''),
  autoOpen: String(env('AUTO_OPEN', 'true')) !== 'false',
  autoStart: String(env('AUTO_START', 'false')) === 'true',
  saveDir: env('SAVE_DIR', join(here, 'saves')),
};
// AI partner invitations live beside the fire's save, shared with the game server
const invitations = new AgentStore(join(CFG.saveDir, 'agents.json'));
const mcpPath = join(here, '..', 'mcp', 'index.js');

// ---- what's happening -------------------------------------------------------
const S = { state: 'off', host: '', error: '', startedAt: 0, log: [] };
let game = null, tunnel = null, token = '';
const say = (line) => {
  const l = String(line).trimEnd();
  if (!l) return;
  S.log.push(`${new Date().toLocaleTimeString()}  ${l}`);
  if (S.log.length > 120) S.log.shift();
  console.log(l);
};

function adminCall(path, method = 'GET', body) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: CFG.adminPort, path, method, timeout: 2000, headers: { 'x-firelight-token': token, 'content-type': 'application/json' } }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function lines(stream, fn) {
  let buf = '';
  stream.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { fn(buf.slice(0, i)); buf = buf.slice(i + 1); } });
}

// ---- lighting and putting out the fire -------------------------------------
async function lightFire() {
  if (S.state !== 'off') return;
  S.state = 'starting'; S.error = ''; S.host = '';
  token = randomBytes(24).toString('hex');
  say('Lighting the fire…');

  game = spawn(process.execPath, [join(here, 'index.js')], {
    cwd: here, env: { ...process.env, ADMIN_TOKEN: token, ADMIN_PORT: String(CFG.adminPort), PORT: String(CFG.gamePort) },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const ready = new Promise((resolve) => {
    lines(game.stdout, (l) => { say(l); if (l.includes('Firelight server:')) resolve(true); });
    lines(game.stderr, (l) => say(l));
    game.on('exit', () => resolve(false));
  });
  game.on('exit', (code) => {
    game = null;
    if (S.state === 'on' || S.state === 'starting') {
      S.error = code ? 'The fire went out unexpectedly. Check the details below, then light it again.' : '';
      stopTunnel();
      S.state = 'off';
    }
  });
  if (!(await ready)) {
    S.state = 'off';
    S.error = S.error || `The fire couldn't start. Is another copy already running on port ${CFG.gamePort}? Check the details below.`;
    return;
  }

  // The tunnel lets people outside your home reach the fire
  const named = CFG.tunnelName && CFG.publicHost;
  const args = named ? ['tunnel', '--no-autoupdate', 'run', CFG.tunnelName] : ['tunnel', '--no-autoupdate', '--url', `http://localhost:${CFG.gamePort}`];
  say(named ? `Opening the tunnel "${CFG.tunnelName}"…` : 'Opening a tunnel so others can reach you…');
  try {
    tunnel = spawn(CFG.cloudflared, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (e) {
    S.error = "Couldn't start cloudflared. Is it installed? See server/README.md."; await putOut(); return;
  }
  tunnel.on('error', async () => { S.error = "Couldn't start cloudflared. Is it installed? See server/README.md."; tunnel = null; await putOut(); });
  const seen = (l) => {
    const m = l.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !S.host) { S.host = m[0].replace('https://', ''); say(`Tunnel open: ${S.host}`); }
    if (named && /Registered tunnel connection/i.test(l) && !S.host) { S.host = CFG.publicHost; say(`Tunnel open: ${S.host}`); }
    if (/ERR|error/i.test(l) && !/INF/.test(l)) say(`tunnel: ${l.replace(/^\S+\s+/, '')}`);
  };
  lines(tunnel.stdout, seen); lines(tunnel.stderr, seen);
  tunnel.on('exit', () => {
    tunnel = null;
    if (S.state === 'on') { S.error = 'The tunnel closed, so people outside your home can no longer reach the fire. Put it out and light it again.'; S.host = ''; }
  });

  // Wait for the address (quick tunnels usually take a few seconds)
  for (let i = 0; i < 60 && !S.host && tunnel && S.state === 'starting'; i++) await new Promise((r) => setTimeout(r, 500));
  if (!S.host) {
    if (S.state === 'starting') { S.error = S.error || "The tunnel didn't open. Check your internet connection, then try again."; await putOut(); }
    return;
  }
  S.state = 'on'; S.startedAt = Date.now();
  say('The fire is lit. Share the invite link.');
}

function stopTunnel() {
  if (!tunnel) return;
  try { tunnel.kill(); } catch { /* already gone */ }
  tunnel = null;
}

async function putOut() {
  if (S.state === 'off' || S.state === 'stopping') return;
  S.state = 'stopping';
  say('Putting the fire out (saving it first)…');
  stopTunnel();
  if (game) {
    const done = new Promise((r) => game.once('exit', r));
    await adminCall('/shutdown', 'POST');
    await Promise.race([done, new Promise((r) => setTimeout(r, 4000))]);
    if (game) { try { game.kill(); } catch { /* gone */ } }
  }
  game = null; S.host = ''; S.state = 'off'; S.startedAt = 0;
  say('The fire is out. It will pick up where it left off next time.');
}

// ---- the panel ----------------------------------------------------------------
const PAGE = readFileSync(join(here, 'panel.html'), 'utf8');
const okHost = (h) => h === `localhost:${CFG.panelPort}` || h === `127.0.0.1:${CFG.panelPort}`;

const panel = http.createServer(async (req, res) => {
  // Only this computer, and only this page (guards against other websites poking it)
  if (!okHost(req.headers.host)) { res.writeHead(403); res.end(); return; }
  const path = (req.url || '/').split('?')[0];
  const reply = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(PAGE); return;
  }
  if (req.method === 'GET' && path === '/api/state') {
    const live = S.state === 'on' ? await adminCall('/people') : null;
    return reply(200, {
      state: S.state, error: S.error, host: S.host, startedAt: S.startedAt,
      invite: S.host ? `${CFG.site}/?fire=${S.host}` : '',
      fire: live?.fire ?? env('FIRE_NAME', 'The Fire'), fuel: live?.fuel ?? null, max: live?.max ?? 20,
      people: live?.people ?? [], radio: live?.radio ?? null, permanent: !!(CFG.tunnelName && CFG.publicHost), log: S.log.slice(-40),
    });
  }
  if (req.method === 'GET' && path === '/api/qr') {
    // The invite link as a QR code: point a phone camera at the screen to join
    if (!S.host) { res.writeHead(404); res.end(); return; }
    const svg = await QRCode.toString(`${CFG.site}/?fire=${S.host}`, { type: 'svg', margin: 1, width: 240, color: { dark: '#1a120c', light: '#fff7ec' } });
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' }); res.end(svg); return;
  }
  if (req.method === 'GET' && path === '/api/agents') {
    const live = S.state === 'on' ? await adminCall('/agents') : null;
    const here = new Map((live?.agents || []).filter((a) => a.here).map((a) => [a.id, a]));
    const people = S.state === 'on' ? (await adminCall('/people'))?.people || [] : [];
    return reply(200, {
      mcpPath,
      invitations: invitations.public().map((a) => ({ ...a, here: here.has(a.id), nameNow: here.has(a.id) ? (here.get(a.id).lastName || a.lastName) : '' })),
      aiHere: people.filter((p) => p.ai).map((p) => p.name),
    });
  }
  if (req.method === 'POST' && req.headers['x-firelight'] === 'panel') {
    let body = ''; req.on('data', (c) => { body += c; });
    await new Promise((r) => req.on('end', r));
    let m = {}; try { m = body ? JSON.parse(body) : {}; } catch { /* empty */ }
    if (path === '/api/on') { lightFire(); return reply(200, { ok: true }); }
    if (path === '/api/off') { await putOut(); return reply(200, { ok: true }); }
    if (path === '/api/agents/add') { const r = invitations.add(m.note); say(`Made an AI partner invitation${m.note ? ` (${m.note})` : ''}.`); return reply(200, { ...r, mcpPath }); }
    if (path === '/api/agents/stop') { if (S.state === 'on') await adminCall('/agents/stop', 'POST', { id: m.id }); return reply(200, { ok: true }); }
    if (path === '/api/agents/revoke') {
      if (S.state === 'on') await adminCall('/agents/revoke', 'POST', { id: m.id });
      invitations.revoke(m.id); say('Took back an AI partner invitation.');
      return reply(200, { ok: true });
    }
    if (path === '/api/agents/wake') {
      const r = invitations.setWake(m.id, m.url);
      if (!r.error) say('Approved a wake address for an AI partner.');
      return reply(r.error ? 400 : 200, r);
    }
    if (path === '/api/agents/unwake') { invitations.clearWake(m.id); say('Removed an AI partner\'s wake address.'); return reply(200, { ok: true }); }
    if (path === '/api/remove' && S.state === 'on') { return reply(200, (await adminCall('/remove', 'POST', { id: m.id, ban: !!m.ban })) ?? { error: 'failed' }); }
  }
  res.writeHead(404); res.end();
});

panel.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`The Firelight panel is already open somewhere. Opening it in your browser: http://localhost:${CFG.panelPort}`);
    openBrowser(); setTimeout(() => process.exit(0), 1500);
  } else { console.error(e); process.exit(1); }
});

function openBrowser() {
  const url = `http://localhost:${CFG.panelPort}`;
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

panel.listen(CFG.panelPort, '127.0.0.1', () => {
  console.log('');
  console.log('  Firelight control panel');
  console.log(`  http://localhost:${CFG.panelPort}`);
  console.log('');
  console.log('  Keep this window open while the fire is lit.');
  console.log('  Closing it puts the fire out (it saves first).');
  console.log('');
  if (CFG.autoOpen) openBrowser();
  if (CFG.autoStart) lightFire();
});

// Closing this window, Ctrl+C, or shutting down: put the fire out properly
let leaving = false;
async function leave() {
  if (leaving) return; leaving = true;
  await putOut();
  process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(sig, leave);
