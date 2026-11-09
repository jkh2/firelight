// ---------------------------------------------------------------------------
// Voice at the fire. Everyone who joins a fire that has voice gets a pass for
// its voice room (LiveKit). Your microphone starts off; you turn it on to talk.
//
// Voices don't come out of the speakers flat, like a phone call: each one is
// played through a Web Audio panner placed at that person's head, the same
// way the fire's crackle is placed in the fire. Grandpa's voice comes from his
// chair, gets quieter as someone wanders into the woods, and moves from ear to
// ear as you turn.
//
// livekit-client is loaded only when a fire actually offers voice, so the game
// stays light for everyone else.
// ---------------------------------------------------------------------------

const HEAD = 1.55;      // height a voice comes from, standing
const SEATED = 1.05;    // ...and sitting

export class VoiceChat {
  /**
   * @param {object} o
   * @param {import('./audio.js').Sound} o.sound  the game's sound (its AudioContext, master and panners)
   * @param {(id: string) => any} o.personFor     the remote player for a voice identity (their game id)
   * @param {(text: string, s?: number) => void} o.hint
   * @param {(state: object) => void} [o.onChange]  mic on/off, connected, local speaking
   * @param {(id: string, speaking: boolean) => void} [o.onSpeaking]
   */
  constructor({ sound, personFor, hint, onChange = () => {}, onSpeaking = () => {} }) {
    Object.assign(this, { sound, personFor, hint, onChange, onSpeaking });
    this.room = null; this.lk = null; this.pass = null;
    this.voices = new Map();     // identity -> { el, src, gain, pan, track }
    this.mutedFor = new Set();   // identities muted just for me
    this.speaking = new Set();
    this.micOn = false; this.connected = false; this.connecting = false; this.meSpeaking = false;
  }

  get available() { return !!this.pass; }

  /** Join (or rejoin, with a new pass after a reconnect) the fire's voice room. */
  async connect(pass) {
    const wasOn = this.micOn;
    await this.disconnect();
    this.pass = pass;
    if (!pass) return this.changed();
    this.connecting = true; this.changed();
    try {
      this.lk ||= await import('livekit-client');
      const { Room, RoomEvent, Track } = this.lk;
      const room = this.room = new Room({
        adaptiveStream: false, dynacast: false, disconnectOnPageLeave: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      room
        .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => { if (track.kind === Track.Kind.Audio) this.attach(participant.identity, track); })
        .on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => this.detach(participant.identity))
        .on(RoomEvent.ParticipantDisconnected, (participant) => this.detach(participant.identity))
        .on(RoomEvent.ActiveSpeakersChanged, (speakers) => this.setSpeakers(speakers))
        .on(RoomEvent.Disconnected, () => {
          if (this.room !== room) return;
          this.connected = false; this.micOn = false;
          for (const id of [...this.voices.keys()]) this.detach(id);
          this.changed();
        })
        .on(RoomEvent.Reconnecting, () => this.hint('Voice dropped for a moment. Reconnecting…', 3))
        .on(RoomEvent.Reconnected, () => this.hint('Voice is back.', 2));
      await room.connect(pass.url, pass.token, { autoSubscribe: true });
      if (this.room !== room) return; // replaced while connecting
      this.connected = true; this.connecting = false;
      // Voices already in the room
      for (const p of room.remoteParticipants.values())
        for (const pub of p.audioTrackPublications.values()) if (pub.track) this.attach(p.identity, pub.track);
      this.changed();
      if (wasOn) await this.setMic(true);
    } catch (e) {
      console.warn('voice', e);
      this.connected = false; this.connecting = false;
      this.room?.disconnect().catch(() => {}); this.room = null;
      this.changed();
      this.hint("Voice couldn't connect right now. Chat still works.", 5);
    }
  }

  async disconnect() {
    const room = this.room;
    this.room = null; this.connected = false; this.micOn = false;
    for (const id of [...this.voices.keys()]) this.detach(id);
    if (room) await room.disconnect().catch(() => {});
  }

  /** Turn my microphone on or off. It always starts off. */
  async setMic(on) {
    if (!this.pass) { this.hint("This fire doesn't have voice yet. Chat still works.", 3); return false; }
    if (this.connecting) { this.hint('Voice is still connecting…', 3); return false; }
    if (!this.connected) {
      // It couldn't connect earlier: try again now that someone wants to talk
      if (!on) return false;
      await this.connect(this.pass);
      if (!this.connected) return false;
    }
    try {
      await this.room.localParticipant.setMicrophoneEnabled(on);
      this.micOn = on;
    } catch (e) {
      this.micOn = false;
      const denied = /denied|NotAllowed|Permission/i.test(String(e?.name) + String(e?.message));
      this.hint(denied ? 'Your browser kept the microphone off. Allow it for this site to talk out loud.' : "Couldn't turn on your microphone.", 6);
    }
    this.changed();
    return this.micOn;
  }

  /** Mute (or unmute) one person's voice, just for me. */
  setMutedFor(id, muted) {
    id = String(id);
    if (muted) this.mutedFor.add(id); else this.mutedFor.delete(id);
    const v = this.voices.get(id);
    if (v) v.gain.gain.setTargetAtTime(muted ? 0 : 1, this.sound.ctx.currentTime, 0.05);
  }
  isMutedFor(id) { return this.mutedFor.has(String(id)); }
  hasVoice(id) { return this.voices.has(String(id)); }

  attach(identity, track) {
    const ctx = this.sound.ctx;
    if (!ctx) return; // sound hasn't started; it starts on join, before voice connects
    this.detach(identity);
    const stream = new MediaStream([track.mediaStreamTrack]);
    // Chrome only feeds a remote WebRTC stream into Web Audio while a media element is also playing it
    const el = new Audio(); el.muted = true; el.srcObject = stream; el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain(); gain.gain.value = this.mutedFor.has(identity) ? 0 : 1;
    const pan = this.sound.panner(0, HEAD, 0, 2.5);
    pan.rolloffFactor = 0.9; // a voice carries a little farther than a crackle
    src.connect(gain).connect(pan).connect(this.sound.master);
    this.voices.set(identity, { el, src, gain, pan, track });
    this.place(identity);
  }

  detach(identity) {
    const v = this.voices.get(identity);
    if (!v) return;
    this.voices.delete(identity);
    try { v.src.disconnect(); v.gain.disconnect(); v.pan.disconnect(); } catch { /* already */ }
    v.el.srcObject = null;
    if (this.speaking.delete(identity)) this.onSpeaking(identity, false);
  }

  setSpeakers(speakers) {
    const now = new Set();
    let me = false;
    for (const s of speakers) { if (s === this.room?.localParticipant) me = true; else now.add(s.identity); }
    for (const id of this.speaking) if (!now.has(id)) this.onSpeaking(id, false);
    for (const id of now) if (!this.speaking.has(id)) this.onSpeaking(id, true);
    this.speaking = now;
    if (me !== this.meSpeaking) { this.meSpeaking = me; this.changed(); }
  }

  /** Put a voice where its person is. */
  place(identity) {
    const v = this.voices.get(identity), r = this.personFor(identity);
    if (!v || !r) return;
    this.sound.setPos(v.pan, r.pos.x, r.pos.y + (r.sitting ? SEATED : HEAD), r.pos.z);
  }

  update() { for (const id of this.voices.keys()) this.place(id); }

  changed() { this.onChange({ available: this.available, connected: this.connected, connecting: this.connecting, micOn: this.micOn, speaking: this.meSpeaking }); }
}
