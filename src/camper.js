import * as THREE from 'three';
import { WORLD, groundY } from './world.js';
import { TWIGS } from './twigs.js';
import { CRATES, eatLine } from './marshmallow.js';

// ---------------------------------------------------------------------------
// A Camper is anyone at the fire. It takes plain actions:
//   walkTo(x, z) · pickTwig(id) · feedFire() · sit(seatId) · stand()
//   useRadio() · openCrate(id) · roast() · eat() · blowOut() · putAwayStick()
//   give(other, 'roasted' | 'raw') · eatTreat()
//   setTorch(on) · steer(dx, dz, run)
// A person's mouse, keyboard or thumbs drive these today. Later a friend
// over the network, or an AI partner, can drive the very same actions.
// ---------------------------------------------------------------------------

const SPEED = { walk: 2.0, run: 4.2 };
const REACH = { twig: 0.75, fire: 3.6, seat: 0.35, crate: 0.85 };
// The sitting animation puts the hips ~0.32 m behind the body's root, with legs
// built for a taller chair. So the root goes in front of the seat and a little low.
const SIT_FORWARD = 0.32;
const GIVE_REACH = 2.6; // close enough to hand something across a seat or two
export const SIT_SINK = 0.16;

export class Camper {
  constructor({ avatar, fire, twigs, seats, colliders, radio = null, crates = null, name = 'You' }) {
    Object.assign(this, { avatar, fire, twigs, seats, colliders, radio, crates, name });
    this.pos = new THREE.Vector3(0, 0, 5);
    this.heading = Math.PI; // facing the fire from +z
    this.mode = 'stand';    // stand | sitting
    this.seat = null;
    this.goal = null;
    this.steerVec = new THREE.Vector2();
    this.running = false;
    this.speed = 0;
    this.carrying = 0;
    this.mallows = 0;   // marshmallows in your pocket
    this.stick = null;  // a twig held as a roasting stick: { mallow: { doneness, burning } | null }
    this.treat = null;  // a roasted marshmallow someone handed you: { doneness, from }
    this.torch = false;
    this.ignoreSeat = -1;
    this.listeners = [];
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data = {}) { for (const fn of this.listeners) fn(type, data); }

  spawnAt(x, z) {
    this.pos.set(x, 0, z);
    this.heading = Math.atan2(-x, -z);
  }

  // ---- actions ------------------------------------------------------------
  walkTo(x, z) {
    if (this.mode === 'sitting') return this.stand(() => this.walkTo(x, z));
    this.goal = { type: 'walk', x, z };
  }
  pickTwig(id) {
    const t = this.twigs.items[id];
    if (!t || !t.present) return;
    if (this.carrying >= TWIGS.carryMax) { this.emit('full'); return; }
    if (this.mode === 'sitting') return this.stand(() => this.pickTwig(id));
    this.goal = { type: 'twig', id };
  }
  feedFire() {
    const emptyStick = this.stick && !this.stick.mallow;
    if (this.carrying <= 0 && !emptyStick) { this.emit(this.stick ? 'busyStick' : 'needTwigs'); return; }
    if (this.mode === 'sitting') { if (!this.avatar.busy) this.toss(); return; }
    this.goal = { type: 'fire' };
  }
  sit(seatId) {
    const s = this.seats[seatId];
    if (!s || (s.occupant && s.occupant !== this)) return;
    if (this.mode === 'sitting') { if (this.seat === s) return; return this.stand(() => this.sit(seatId)); }
    this.goal = { type: 'seat', id: seatId };
  }
  /** Walk to a hidden crate and take the marshmallows inside. */
  openCrate(id) {
    const c = this.crates?.items[id];
    if (!c) return;
    if (!c.full) { this.emit('crateEmpty'); return; }
    if (this.mallows >= CRATES.carryMax) { this.emit('mallowsFull'); return; }
    if (this.mode === 'sitting') return this.stand(() => this.openCrate(id));
    this.goal = { type: 'crate', id };
  }
  /** Put a marshmallow on a stick. Uses one of your twigs as the stick. */
  roast() {
    if (this.stick?.mallow) return;
    if (this.mallows <= 0) { this.emit('needMallows'); return; }
    if (!this.stick) {
      if (this.carrying <= 0) { this.emit('needStick'); return; }
      this.carrying--;
      this.avatar.setCarrying(this.carrying);
      this.stick = { mallow: null };
    }
    this.mallows--;
    this.stick.mallow = { doneness: 0, burning: false, heat: 0 };
    this.emit('roasting');
  }
  eat() {
    const m = this.stick?.mallow;
    if (!m || m.burning) return;
    this.stick.mallow = null;
    this.emit('ate', { doneness: m.doneness, line: eatLine(m) });
  }
  blowOut() {
    const m = this.stick?.mallow;
    if (!m?.burning) return;
    m.burning = false;
    this.emit('blewOut');
  }
  /**
   * Share with someone at the fire (James's idea). `what` is 'roasted' (straight
   * off your stick, for them to eat) or 'raw' (one from your pocket to roast
   * themselves). Works between any two Campers within arm's reach: people now,
   * friends over the network in Phase 2, AI partners later.
   */
  give(other, what = 'roasted') {
    if (!other || other === this) return false;
    if (this.pos.distanceTo(other.pos) > GIVE_REACH) { this.emit('tooFar', { to: other.name }); return false; }
    if (what === 'roasted') {
      const m = this.stick?.mallow;
      if (!m || m.burning) return false;
      this.stick.mallow = null;
      other.receive('roasted', { doneness: m.doneness, from: this.name });
    } else {
      if (this.mallows <= 0) return false;
      if (other.mallows >= CRATES.carryMax) { this.emit('theirPocketsFull', { to: other.name }); return false; }
      this.mallows--;
      other.receive('raw', { from: this.name });
    }
    this.emit('gave', { what, to: other.name });
    return true;
  }
  receive(what, { doneness = 0, from = 'someone' } = {}) {
    if (what === 'roasted') this.treat = { doneness, from };   // held, ready to eat
    else this.mallows = Math.min(CRATES.carryMax, this.mallows + 1);
    this.emit('received', { what, from, doneness });
  }
  /** Eat a roasted marshmallow someone handed you. */
  eatTreat() {
    if (!this.treat) return;
    const t = this.treat; this.treat = null;
    this.emit('ate', { doneness: t.doneness, line: eatLine(t), from: t.from });
  }
  /** The stick goes back to being a twig. */
  putAwayStick() {
    if (!this.stick) return;
    if (this.stick.mallow) { this.mallows = Math.min(CRATES.carryMax, this.mallows + (this.stick.mallow.doneness < 0.05 ? 1 : 0)); }
    this.stick = null;
    if (this.carrying < TWIGS.carryMax) { this.carrying++; this.avatar.setCarrying(this.carrying); }
    this.emit('stickAway');
  }
  /** Walk up to the radio. From a seat right beside it, just reach over. */
  useRadio() {
    if (!this.radio) return;
    const d = Math.hypot(this.pos.x - this.radio.pos.x, this.pos.z - this.radio.pos.z);
    if (d < 1.7) { this.goal = null; this.emit('radio'); return; }
    if (this.mode === 'sitting') return this.stand(() => this.useRadio());
    this.goal = { type: 'radio' };
  }
  stand(then) {
    if (this.mode !== 'sitting') { then?.(); return; }
    if (this.standing) return;
    this.standing = true;
    this.avatar.once('Sit_Chair_StandUp', {
      done: () => {
        const s = this.seat;
        this.ignoreSeat = s.id;
        s.occupant = null;
        this.seat = null;
        this.mode = 'stand';
        this.standing = false;
        this.emit('stood');
        then?.();
      },
    });
  }
  setTorch(on) { this.torch = on; this.avatar.setTorch(on); this.emit('torch', { on }); }
  toggleTorch() { this.setTorch(!this.torch); }
  /** Direct steering in world space (keyboard). Cancels any walk goal. */
  steer(dx, dz, run = false) {
    this.steerVec.set(dx, dz);
    this.running = run;
    if (this.steerVec.lengthSq() > 0.01) {
      this.goal = null;
      if (this.mode === 'sitting') this.stand();
    }
  }

  // ---- internals ----------------------------------------------------------
  toss() {
    const sitting = this.mode === 'sitting';
    const release = () => {
      if (this.stick && !this.stick.mallow) {
        // Done roasting: the stick itself goes on the fire
        this.stick = null;
        this.emit('release', { from: this.avatar.handPosition(), stick: true });
        return;
      }
      if (this.carrying <= 0) return;
      this.carrying--;
      this.avatar.setCarrying(this.carrying);
      this.emit('release', { from: this.avatar.handPosition() });
    };
    if (sitting) { release(); return; }
    this.heading = Math.atan2(-this.pos.x, -this.pos.z);
    this.avatar.once('Throw', { at: 0.38, onAt: release, done: () => this.emit('thrown') });
  }

  goalPoint() {
    const g = this.goal;
    if (!g) return null;
    if (g.type === 'walk') return { x: g.x, z: g.z, reach: 0.15 };
    if (g.type === 'twig') { const t = this.twigs.items[g.id]; return t.present ? { x: t.x, z: t.z, reach: REACH.twig } : null; }
    if (g.type === 'fire') {
      const d = Math.hypot(this.pos.x, this.pos.z) || 1;
      if (d <= REACH.fire) return { x: this.pos.x, z: this.pos.z, reach: 1 };
      const k = (REACH.fire - 0.3) / d;
      return { x: this.pos.x * k, z: this.pos.z * k, reach: 0.35 };
    }
    if (g.type === 'radio') return { x: this.radio.pos.x, z: this.radio.pos.z, reach: 1.0 };
    if (g.type === 'crate') { const c = this.crates.items[g.id]; return { x: c.x, z: c.z, reach: REACH.crate }; }
    if (g.type === 'seat') {
      const s = this.seats[g.id];
      // Approach from the fire side, then settle onto the seat
      return { x: s.x + Math.sin(s.facing) * 0.75, z: s.z + Math.cos(s.facing) * 0.75, reach: REACH.seat };
    }
    return null;
  }

  arrive() {
    const g = this.goal; this.goal = null;
    if (g.type === 'twig') {
      const t = this.twigs.items[g.id];
      if (!t.present) return;
      this.heading = Math.atan2(t.x - this.pos.x, t.z - this.pos.z);
      this.avatar.once('PickUp', {
        at: 0.42,
        onAt: () => {
          if (this.carrying < TWIGS.carryMax && this.twigs.take(g.id)) {
            this.carrying++;
            this.avatar.setCarrying(this.carrying);
            this.emit('picked', { carrying: this.carrying });
          }
        },
      });
    } else if (g.type === 'fire') {
      this.toss();
    } else if (g.type === 'crate') {
      const c = this.crates.items[g.id];
      this.heading = Math.atan2(c.x - this.pos.x, c.z - this.pos.z);
      this.avatar.once('PickUp', {
        at: 0.45,
        onAt: () => {
          const n = this.crates.take(g.id);
          if (!n) { this.emit('crateEmpty'); return; }
          const got = Math.min(n, CRATES.carryMax - this.mallows);
          this.mallows += got;
          this.emit('foundMallows', { got, total: this.mallows });
        },
      });
    } else if (g.type === 'radio') {
      this.heading = Math.atan2(this.radio.pos.x - this.pos.x, this.radio.pos.z - this.pos.z);
      this.emit('radio');
    } else if (g.type === 'seat') {
      const s = this.seats[g.id];
      if (s.occupant && s.occupant !== this) return;
      s.occupant = this;
      this.seat = s;
      this.mode = 'sitting';
      this.heading = s.facing;
      this.pos.set(s.sitX + Math.sin(s.facing) * SIT_FORWARD, 0, s.sitZ + Math.cos(s.facing) * SIT_FORWARD);
      this.avatar.once('Sit_Chair_Down', { done: () => this.emit('sat', { seat: s.id }) });
      this.emit('sitting', { seat: s.id });
    }
  }

  collide() {
    for (const c of this.colliders) {
      if (c.seat != null && (c.seat === this.ignoreSeat || (this.goal?.type === 'seat' && this.goal.id === c.seat))) continue;
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z, d = Math.hypot(dx, dz), min = c.r + 0.28;
      if (d < min && d > 1e-4) { this.pos.x = c.x + (dx / d) * min; this.pos.z = c.z + (dz / d) * min; }
    }
    const pit = this.fire.pitRadius, d = Math.hypot(this.pos.x, this.pos.z);
    if (d < pit && d > 1e-4) { this.pos.x *= pit / d; this.pos.z *= pit / d; }
    if (d > WORLD.walkRadius) { this.pos.x *= WORLD.walkRadius / d; this.pos.z *= WORLD.walkRadius / d; }
    if (this.ignoreSeat >= 0) {
      const s = this.seats[this.ignoreSeat];
      if (Math.hypot(this.pos.x - s.x, this.pos.z - s.z) > 0.9) this.ignoreSeat = -1;
    }
  }

  update(dt) {
    let locomotion = 'Idle';
    let moveX = 0, moveZ = 0, speed = 0;

    if (this.mode === 'sitting') {
      locomotion = 'Sit_Chair_Idle';
    } else if (!this.avatar.busy) {
      if (this.steerVec.lengthSq() > 0.01) {
        const l = Math.min(1, this.steerVec.length());
        moveX = this.steerVec.x / this.steerVec.length(); moveZ = this.steerVec.y / this.steerVec.length();
        speed = (this.running ? SPEED.run : SPEED.walk) * l;
      } else if (this.goal) {
        const p = this.goalPoint();
        if (!p) this.goal = null;
        else {
          const dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = Math.hypot(dx, dz);
          if (d <= p.reach) this.arrive();
          else {
            moveX = dx / d; moveZ = dz / d;
            speed = Math.min(d > 6 ? SPEED.run : SPEED.walk, d / dt);
          }
        }
      }
    }

    if (speed > 0) {
      this.pos.x += moveX * speed * dt;
      this.pos.z += moveZ * speed * dt;
      const want = Math.atan2(moveX, moveZ);
      let diff = ((want - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.heading += diff * (1 - Math.exp(-dt * 12));
      locomotion = speed > 3 ? 'Running_A' : 'Walking_A';
    }
    this.speed = speed;
    if (this.mode !== 'sitting') this.collide();
    // Ease into and out of the seat height
    const sinkTo = this.mode === 'sitting' && !this.standing ? SIT_SINK : 0;
    this.sink = (this.sink ?? 0) + (sinkTo - (this.sink ?? 0)) * (1 - Math.exp(-dt * 6));
    this.pos.y = groundY(this.pos.x, this.pos.z) - this.sink;

    this.avatar.root.position.copy(this.pos);
    // Ease the body's turn so snaps (like turning to the fire) read as a turn
    const cur = this.avatar.root.rotation.y;
    let d = ((this.heading - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.avatar.root.rotation.y = cur + d * (1 - Math.exp(-dt * 10));
    this.avatar.update(dt, locomotion);
  }
}
