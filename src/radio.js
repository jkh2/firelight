import * as THREE from 'three';
import { makeLog, propCopy, groundY } from './world.js';

// ---------------------------------------------------------------------------
// The radio on a stump table by the fire. Anyone can walk up, paste a
// YouTube link, and it plays through YouTube's official embedded player.
// Its volume follows how far you are from the table.
// In Phase 2 the server shares {videoId, startedAt} so everyone hears the
// same song at the same moment; this module already plays from a start time.
// ---------------------------------------------------------------------------

export const RADIO = { angle: 2.5, radius: 3.6, hearing: 16, maxVolume: 70 };

/** Pulls the video id out of any common YouTube link shape. */
export function parseYouTube(text) {
  const s = String(text || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1, 12) || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v').slice(0, 11);
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch { /* not a URL */ }
  return null;
}

function noteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffd9a0'; g.font = 'bold 50px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff9a4a'; g.shadowBlur = 10;
  g.fillText('♪', 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

let apiPromise = null;
function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { apiPromise = null; reject(new Error('YouTube could not be reached')); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

export class Radio {
  constructor(scene, props, colliders) {
    const x = Math.cos(RADIO.angle) * RADIO.radius, z = Math.sin(RADIO.angle) * RADIO.radius;
    this.pos = new THREE.Vector3(x, groundY(x, z), z);
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.group.rotation.y = Math.atan2(x, z); // the dial faces away from the fire, toward the ring
    scene.add(this.group);

    // Stump table: a short thick log stood on end
    const tableH = 0.42;
    const stump = makeLog(props, tableH, 0.55);
    const stand = new THREE.Group();
    stump.rotation.z = Math.PI / 2;
    stump.position.set(0.275, tableH / 2, 0); // re-center after standing it on end
    stand.add(stump);
    this.group.add(stand);

    // Radio on top, sized to about 34 cm wide
    const radio = propCopy(props.getObjectByName('Radio'));
    const box = new THREE.Box3().setFromObject(radio), size = box.getSize(new THREE.Vector3());
    const k = 0.34 / Math.max(size.x, size.z);
    radio.scale.setScalar(k);
    if (size.z > size.x) radio.rotation.y = Math.PI / 2;
    radio.position.y = tableH + 0.03 - box.min.y * k;
    this.group.add(radio);
    this.radioTop = tableH + 0.03 + size.y * k;

    // A dial that glows while the radio plays
    this.dial = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.03), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0 }));
    this.dial.position.set(0, tableH + 0.03 + size.y * k * 0.62, Math.min(size.x, size.z) * k * 0.5 + 0.004);
    this.group.add(this.dial);

    // Everything here can be clicked
    this.group.traverse((o) => { if (o.isMesh) o.userData.radio = true; });
    colliders.push({ x, z, r: 0.38, radio: true });

    // Drifting music notes
    const tex = noteTexture();
    this.notes = [0, 1, 2, 3].map((i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      s.scale.setScalar(0.16); s.userData.t = i / 4;
      scene.add(s);
      return s;
    });

    this.videoId = null;
    this.playing = false;
    this.title = '';
    this.player = null;
    this.listeners = [];
    this.time = 0;
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data = {}) { for (const fn of this.listeners) fn(type, data); }

  /** Start a video. `startedAt` (ms since epoch) lets late arrivals join mid-song. */
  async play(videoId, startedAt = Date.now(), { remote = false } = {}) {
    this.videoId = videoId;
    this.startedAt = startedAt;
    this.tunedOut = false;
    this.emit('loading', { videoId, remote });
    let YT;
    try { YT = await loadYouTubeAPI(); } catch (e) { this.emit('error', { message: 'YouTube could not be reached. Check your connection and try again.' }); return; }
    const start = Math.max(0, (Date.now() - startedAt) / 1000);
    if (this.player?.loadVideoById) {
      this.player.loadVideoById({ videoId, startSeconds: start });
      return;
    }
    this.player = new YT.Player('ytPlayer', {
      width: '100%', height: '100%', videoId,
      playerVars: { autoplay: 1, start: Math.floor(start), playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: (e) => { e.target.setVolume(0); e.target.playVideo(); },
        onStateChange: (e) => {
          const S = YT.PlayerState;
          if (e.data === S.PLAYING) {
            this.playing = true;
            this.title = e.target.getVideoData()?.title || '';
            this.emit('playing', { title: this.title });
          } else if (e.data === S.ENDED) { this.stop({ remote: true }); this.emit('ended'); }
          else if (e.data === S.PAUSED) { this.playing = false; this.emit('paused'); }
        },
        onError: (e) => {
          const why = { 2: "That link doesn't look like a YouTube video.", 5: "That video can't play here.", 100: 'That video was removed or is private.',
            101: "The uploader doesn't allow that video to play outside YouTube. Try another.", 150: "The uploader doesn't allow that video to play outside YouTube. Try another." };
          this.playing = false;
          this.emit('error', { message: why[e.data] || "That video couldn't play. Try another." });
        },
      },
    });
  }

  /** Stop listening yourself. The song keeps going for everyone else at the fire. */
  tuneOut() {
    if (!this.videoId) return;
    this.tunedOut = true;
    this.playing = false;
    try { this.player?.stopVideo(); } catch { /* player not ready */ }
    this.emit('tunedOut');
  }
  /** Pick the song back up where everyone else is in it. */
  tuneIn() {
    if (!this.videoId) return;
    this.play(this.videoId, this.startedAt, { remote: true });
  }

  stop({ remote = false } = {}) {
    this.tunedOut = false;
    this.playing = false;
    this.videoId = null;
    try { this.player?.stopVideo(); } catch { /* player not ready */ }
    this.emit('stopped', { remote });
  }

  /** Volume follows the listener's distance from the table. */
  update(dt, listenerPos, muted) {
    this.time += dt;
    const d = listenerPos.distanceTo(this.pos);
    const near = THREE.MathUtils.clamp(1 - (d - 1.2) / RADIO.hearing, 0, 1);
    this.volume = muted ? 0 : Math.round(RADIO.maxVolume * Math.pow(near, 1.6));
    if (this.player?.setVolume && this.time - (this._lastVol ?? -1) > 0.2) { this.player.setVolume(this.volume); this._lastVol = this.time; }

    const on = this.playing ? 1 : 0;
    this.dial.material.opacity += (on * (0.75 + 0.25 * Math.sin(this.time * 6)) - this.dial.material.opacity) * Math.min(1, dt * 6);
    for (const n of this.notes) {
      n.userData.t = (n.userData.t + dt * 0.28) % 1;
      const t = n.userData.t, a = t * 6.283 + n.id;
      n.position.set(this.pos.x + Math.sin(a) * 0.12 * t, this.pos.y + this.radioTop + t * 0.7, this.pos.z + Math.cos(a * 0.7) * 0.12 * t);
      n.material.opacity = on * Math.sin(t * Math.PI) * 0.85;
      n.visible = this.playing;
    }
  }
}
