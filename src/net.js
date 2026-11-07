import { PROTOCOL } from '../shared/rules.js';

// ---------------------------------------------------------------------------
// The connection to a shared fire. The invite link carries the fire's
// address: firelight-six.vercel.app/?fire=<host>. Without one, Firelight
// runs on its own, single player.
// ---------------------------------------------------------------------------

/** The fire's address from the link (?fire=), or the build's default, as a ws(s):// URL. */
export function fireAddress() {
  let raw = '';
  try { raw = new URLSearchParams(location.search).get('fire') || ''; } catch { /* no URL */ }
  raw = raw || import.meta.env.VITE_FIRE_SERVER || '';
  raw = raw.trim();
  if (!raw) return null;
  if (/^wss?:\/\//.test(raw)) return raw;
  if (/^https?:\/\//.test(raw)) return raw.replace(/^http/, 'ws');
  const local = /^(localhost|127\.|\[::1\])/.test(raw);
  return `${local ? 'ws' : 'wss'}://${raw}`;
}

/** The plain web address of the same server, for the little status check. */
export const statusAddress = (ws) => ws.replace(/^ws/, 'http');

export class Net {
  constructor(url) {
    this.url = url;
    this.handlers = new Map();
    this.ws = null;
    this.id = null;
    this.closedForGood = false;
    this.retry = 0;
  }

  on(type, fn) { (this.handlers.get(type) ?? this.handlers.set(type, []).get(type)).push(fn); return this; }
  emit(type, m) { for (const fn of this.handlers.get(type) ?? []) fn(m); }

  /** Connect and say hello. Resolves with the welcome, or rejects if the fire can't be reached. */
  connect(hello) {
    this.hello = hello;
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = this.ws = new WebSocket(this.url);
      const timer = setTimeout(() => { if (!settled) { settled = true; ws.close(); reject(new Error('timeout')); } }, 9000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, ...this.hello }));
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'welcome') {
          this.id = m.id; this.retry = 0;
          if (!settled) { settled = true; clearTimeout(timer); resolve(m); } else this.emit('rewelcome', m);
          return;
        }
        if (m.t === 'bye') {
          this.closedForGood = true;
          if (!settled) { settled = true; clearTimeout(timer); reject(Object.assign(new Error(m.text), { bye: m })); }
          this.emit('bye', m);
          return;
        }
        this.emit(m.t, m);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!settled) { settled = true; reject(new Error('closed')); return; }
        // A goodbye from the fire (removed, full, fire put out) keeps its own message
        if (this.closedForGood) return;
        this.emit('lost');
        this.reconnect();
      };
      ws.onerror = () => { /* onclose follows */ };
    });
  }

  reconnect() {
    const wait = Math.min(15000, 1000 * 2 ** this.retry++);
    setTimeout(() => {
      this.connect(this.hello).then((m) => this.emit('rewelcome', m)).catch(() => { if (!this.closedForGood) this.reconnect(); });
    }, wait);
  }

  send(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  act(a, data = {}) { this.send({ t: 'act', a, ...data }); }
  get open() { return this.ws?.readyState === 1; }
}
