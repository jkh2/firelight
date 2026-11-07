// ---------------------------------------------------------------------------
// The web connector: the same Firelight tools over Streamable HTTP, hosted by
// the fire itself at /mcp. This is how an AI partner in an app that only takes
// remote connectors (the Claude app's custom connectors, for one) comes to the
// fire. Each connection gets its own Fire: a body joined over loopback with the
// partner's invitation key, exactly as the local connector would.
//
// The key travels in the request header:  Authorization: Bearer fl_…
// For apps that can't set a header, the key may instead end the address:
//   https://<fire>/mcp/fl_…   (keep that address private; it is the key)
//
// Nothing is remembered between connections. When the partner's app ends the
// session, or it goes quiet past the idle limit, the body leaves the fire.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Fire, createFirelightServer } from './tools.js';

/**
 * @param {object} o
 * @param {string} o.fireAddress   loopback address of this fire's socket, e.g. ws://127.0.0.1:8787
 * @param {(key: string) => boolean} o.checkKey  is this a live invitation key?
 * @param {number} [o.idleMinutes] close a session nobody has used for this long
 * @param {number} [o.maxSessions]
 * @param {(line: string) => void} [o.log]
 * @returns {(req, res) => Promise<void>} a handler for requests under /mcp
 */
export function createWebConnector({ fireAddress, checkKey, idleMinutes = 20, maxSessions = 20, log = () => {} }) {
  const sessions = new Map(); // session id -> { transport, fire, key, last }

  const deny = (res, status, message) => {
    res.writeHead(status, { 'content-type': 'application/json', ...(status === 401 ? { 'www-authenticate': 'Bearer realm="firelight"' } : {}) });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message }, id: null }));
  };

  function keyFrom(req) {
    const h = req.headers.authorization || '';
    const m = /^Bearer\s+(\S+)$/i.exec(h);
    if (m) return m[1];
    const p = /^\/mcp\/(fl_[0-9a-f]{40})\/?(?:\?.*)?$/.exec(req.url || '');
    return p ? p[1] : '';
  }

  async function end(id, why) {
    const s = sessions.get(id);
    if (!s) return;
    sessions.delete(id);
    try { if (s.fire.ws && s.fire.me) await s.fire.cmd({ do: 'leave' }, 3000); } catch { /* already gone */ }
    s.fire.ws?.close();
    try { await s.transport.close(); } catch { /* closed */ }
    log(`web connector: session ended (${why})`);
  }

  // Quiet sessions close, and their bodies leave, the same as a person who walks away
  setInterval(() => {
    const cutoff = Date.now() - idleMinutes * 60000;
    for (const [id, s] of sessions) if (s.last < cutoff && !s.fire.waiting.size) end(id, 'idle');
  }, 60000).unref();

  return async function handle(req, res) {
    const key = keyFrom(req);
    if (!key || !checkKey(key)) return deny(res, 401, 'Firelight needs a live invitation key: Authorization: Bearer fl_… (the host makes one in the host panel).');

    const sid = req.headers['mcp-session-id'];
    let s = sid ? sessions.get(sid) : null;
    if (sid && !s) return deny(res, 404, 'That session has ended. Connect again.');
    if (s && s.key !== key) return deny(res, 403, 'That session belongs to another key.');

    if (!s) {
      if (req.method !== 'POST') return deny(res, 400, 'Start with an initialize request.');
      if (sessions.size >= maxSessions) return deny(res, 503, 'The fire has too many connector sessions right now.');
      // One session per key: a new connection replaces the old one, like a person stepping back in
      for (const [id, o] of sessions) if (o.key === key) await end(id, 'replaced');
      const fire = new Fire({ address: fireAddress, key });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => { sessions.set(id, s); log('web connector: a partner connected'); },
      });
      s = { transport, fire, key, last: Date.now() };
      transport.onclose = () => { if (transport.sessionId && sessions.has(transport.sessionId)) end(transport.sessionId, 'closed'); };
      await createFirelightServer(fire).connect(transport);
    }

    s.last = Date.now();
    try { await s.transport.handleRequest(req, res); }
    catch (e) { if (!res.headersSent) deny(res, 500, 'The web connector stumbled: ' + e.message); }
  };
}
