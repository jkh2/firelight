import * as THREE from 'three';
import { Net } from './net.js';
import { RemotePlayer } from './remote.js';

// ---------------------------------------------------------------------------
// Joins a shared fire and keeps this player and the world in step with it.
// The game itself barely knows: the Camper still takes the same actions, and
// this module tells the server about them and applies what others do.
// ---------------------------------------------------------------------------

export async function joinFire(url, g) {
  const { scene, me, fire, twigs, crates, seats, radio, sound, hint, throwTwig, models, clips, torchModel } = g;
  const net = new Net(url);
  const welcome = await net.connect(g.hello);

  const remotes = new Map();
  const others = () => [...remotes.values()];
  let myId = welcome.id;
  let fuelTarget = welcome.world.fuel;
  let lastCrateGot = 0;

  twigs.networked = true;
  crates.networked = true;

  function applyWorld(w) {
    fire.fuel = w.fuel; fuelTarget = w.fuel;
    w.twigs.forEach(([present, gen], i) => {
      const it = twigs.items[i];
      it.gen = gen;
      if (present) twigs.scatter(i); else twigs.hide(i);
    });
    w.crates.forEach((full, i) => { if (full) crates.refill(i); else crates.markEmpty(i); });
    seats.forEach((s, i) => { const by = w.seats[i]; s.occupant = by ? (by === myId ? me : { remote: by }) : (s.occupant === me ? me : null); });
    if (w.radio) radio.play(w.radio.videoId, w.radio.startedAt, { remote: true });
  }
  function addPlayer(info) {
    if (info.id === myId || remotes.has(info.id)) return;
    remotes.set(info.id, new RemotePlayer(scene, info, { models, clips, torchModel, fire, seats }));
  }
  function setup(w) {
    myId = w.id;
    for (const r of others()) r.dispose();
    remotes.clear();
    applyWorld(w.world);
    for (const p of w.players) addPlayer(p);
    g.onCount?.(remotes.size + 1, w.fireName);
  }
  setup(welcome);

  // ---- from the server --------------------------------------------------------
  net.on('rewelcome', (w) => { setup(w); hint('Back at the fire.', 2.5); });
  net.on('lost', () => hint('Lost the connection to the fire. Reconnecting…', 6));
  net.on('bye', (m) => hint(m.text, 10));
  net.on('joined', (m) => { addPlayer(m.p); g.onCount?.(remotes.size + 1); hint(`${m.p.name} joined the fire.`, 3.5); });
  net.on('left', (m) => {
    const r = remotes.get(m.id);
    if (!r) return;
    r.dispose(); remotes.delete(m.id);
    for (const s of seats) if (s.occupant?.remote === m.id) s.occupant = null;
    g.onCount?.(remotes.size + 1);
    hint(`${r.name} left the fire.`, 3);
  });
  net.on('snap', (m) => {
    fuelTarget = m.fuel;
    for (const st of m.ps) if (st.id !== myId) remotes.get(st.id)?.push(st);
  });
  net.on('ev', (m) => {
    const r = remotes.get(m.by);
    switch (m.e) {
      case 'fed':
        if (r) { r.once('Throw'); throwTwig(r.avatar.handPosition(new THREE.Vector3()), { remote: true }); }
        break;
      case 'twigTaken': twigs.hide(m.id); r?.once('PickUp'); break;
      case 'twigDenied':
        // Someone else grabbed it first
        if (me.carrying > 0) { me.carrying--; me.avatar.setCarrying(me.carrying); g.onInventory?.(); }
        hint('Someone got to that twig first.', 2.5);
        break;
      case 'twigBack': twigs.respawn(m.id, m.gen); break;
      case 'crateTaken': crates.markEmpty(m.id); r?.once('PickUp'); break;
      case 'crateDenied':
        me.mallows = Math.max(0, me.mallows - lastCrateGot); g.onInventory?.();
        hint('Someone just emptied that crate.', 3);
        break;
      case 'crateBack': crates.refill(m.id); break;
      case 'seat': {
        const s = seats[m.seat];
        if (!s) break;
        if (m.by === myId) { s.occupant = me; break; }
        if (m.by) {
          if (me.seat === s) { me.stand(); hint('Someone else sat there.', 2.5); }
          s.occupant = { remote: m.by };
        } else if (s.occupant !== me) s.occupant = null;
        break;
      }
      case 'seatDenied': if (me.seat === seats[m.seat]) me.stand(); hint('That seat is taken.', 2.5); break;
      case 'radio':
        if (m.radio) { if (m.radio.videoId !== radio.videoId) radio.play(m.radio.videoId, m.radio.startedAt, { remote: true }); }
        else if (radio.videoId) radio.stop({ remote: true });
        break;
      case 'gift': me.receive(m.what, { doneness: m.d, from: m.fromName }); break;
      case 'gave': {
        const from = remotes.get(m.from), to = remotes.get(m.to);
        if (from && to) hint(`${from.name} handed ${to.name} a marshmallow.`, 3);
        break;
      }
      default:
    }
  });

  // ---- to the server --------------------------------------------------------------
  twigs.onTake = (id) => net.act('twig', { id });
  crates.onTake = (id) => net.act('crate', { id });
  me.on((type, d) => {
    if (type === 'release') net.act('feed', { stick: !!d.stick });
    if (type === 'sitting') net.act('sit', { seat: d.seat });
    if (type === 'stood') net.act('stand');
    if (type === 'foundMallows') lastCrateGot = d.got;
  });
  radio.on((type, d) => {
    if (type === 'loading' && !d.remote) net.act('radio', { videoId: d.videoId });
    if (type === 'stopped' && !d.remote) net.act('radioOff');
  });

  /** Hand a marshmallow to someone: a stand-in the Camper's give() can use. */
  function personFor(id) {
    const r = remotes.get(id);
    if (!r) return null;
    return { name: r.name, pos: r.pos, mallows: 0, receive: (what, { doneness }) => net.act('give', { to: id, what, d: doneness }) };
  }

  let sendT = 0;
  function update(dt) {
    // The server's fire is the real one; ease toward it
    fire.fuel += (fuelTarget - fire.fuel) * Math.min(1, dt * 2);
    for (const r of others()) r.update(dt);
    sendT += dt;
    if (sendT >= 0.1 && net.open) {
      sendT = 0;
      const m = me.stick?.mallow;
      net.send({
        t: 'st', x: +me.pos.x.toFixed(2), z: +me.pos.z.toFixed(2), h: +me.heading.toFixed(3),
        m: me.mode === 'sitting' ? 1 : 0, s: me.seat ? me.seat.id : -1, o: me.torch ? 1 : 0, c: me.carrying,
        k: me.stick ? { d: m ? +m.doneness.toFixed(3) : -1, b: m?.burning ? 1 : 0 } : null,
      });
    }
  }

  return { net, remotes, update, personFor, get id() { return myId; }, fireName: welcome.fireName, owner: welcome.owner };
}
