// ---------------------------------------------------------------------------
// Voice passes. Voice runs through LiveKit (a free LiveKit Cloud project is
// plenty for a family fire). The fire hands each person who has joined a pass
// for this fire's voice room: audio only, microphone only, for six hours.
// AI partners don't get one; they speak in text.
//
// Being in the voice room follows being at the fire: when someone leaves, is
// removed or is banned, the fire takes them out of the voice room too.
//
// Settings (server/config.json, which git ignores, or environment):
//   LIVEKIT_URL         wss://<project>.livekit.cloud
//   LIVEKIT_API_KEY     API…
//   LIVEKIT_API_SECRET  never share it; it stays on the host's computer
// ---------------------------------------------------------------------------

import { createHmac } from 'node:crypto';

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

/** A LiveKit access token: a JWT signed with the project's secret. */
function sign(payload, key, secret, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: key, nbf: now - 10, exp: now + ttlSeconds, ...payload };
  const head = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(body);
  return head + '.' + createHmac('sha256', secret).update(head).digest('base64url');
}

export class Voice {
  constructor({ url, key, secret, fireName, log = () => {} }) {
    this.on = !!(url && key && secret);
    Object.assign(this, { url, key, secret, log });
    this.room = 'firelight-' + (String(fireName || 'fire').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'fire');
  }

  /** The pass a joined person gets in their welcome: where to connect and the token. */
  passFor(p) {
    if (!this.on || p.ai) return null;
    const token = sign({
      sub: String(p.id), jti: String(p.id), name: p.name,
      video: { room: this.room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false, canPublishSources: ['microphone'] },
    }, this.key, this.secret, 6 * 3600);
    return { url: this.url, token, room: this.room };
  }

  /** Take someone out of the voice room (they left, were removed, or were banned). */
  async remove(id) {
    if (!this.on) return;
    const admin = sign({ video: { room: this.room, roomAdmin: true } }, this.key, this.secret, 60);
    const api = this.url.replace(/^ws/, 'http').replace(/\/+$/, '') + '/twirp/livekit.RoomService/RemoveParticipant';
    try {
      const r = await fetch(api, {
        method: 'POST', signal: AbortSignal.timeout(5000),
        headers: { authorization: `Bearer ${admin}`, 'content-type': 'application/json' },
        body: JSON.stringify({ room: this.room, identity: String(id) }),
      });
      // 404 just means they weren't in the voice room
      if (!r.ok && r.status !== 404) this.log(`Voice: couldn't remove someone from the voice room (${r.status}).`);
    } catch (e) { this.log(`Voice: couldn't reach LiveKit (${e.cause?.code || e.name}).`); }
  }
}
