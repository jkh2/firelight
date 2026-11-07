// ---------------------------------------------------------------------------
// The rules of the fire, shared by the game and the server so they always
// agree. Plain JavaScript with no imports, so Node and the browser can both
// load it.
// ---------------------------------------------------------------------------

export const PROTOCOL = 1;          // bump when messages change shape
export const MAX_PLAYERS = 20;      // a fire holds up to 20 people

export const FIRE = {
  maxFuel: 80,         // fuel cap; size reaches 1 at bonfireFuel and ~1.15 at the cap
  bonfireFuel: 60,
  burnBase: 0.012,     // twigs per second at any size
  burnPerFuel: 0.0045, // extra burn per twig of fuel (big fires eat fast)
  startFuel: 8,
};

/** One step of burning. Used by the game, the server, and catch-up after a restart. */
export function burn(fuel, dt) {
  return fuel <= 0 ? 0 : Math.max(0, fuel - dt * (FIRE.burnBase + FIRE.burnPerFuel * fuel));
}

export const TWIGS = { count: 48, carryMax: 5, regrowMin: 40, regrowMax: 95, minR: 4.6, maxR: 16.5 };
export const CRATES = { count: 5, minR: 8.5, maxR: 16.5, refillMin: 90, refillMax: 160, give: [2, 3], carryMax: 6 };
export const SEATS = 10;

/** A small seeded random number generator, so every player builds the same world. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where twig `id` lies in its `gen`-th life. Every player computes the same spot. */
export function twigSpot(id, gen, blocked = () => false) {
  const r = seeded(id * 7919 + gen * 104729 + 17);
  let x = 0, z = 0;
  for (let tries = 0; tries < 20; tries++) {
    const a = r() * Math.PI * 2;
    const d = TWIGS.minR + Math.pow(r(), 0.75) * (TWIGS.maxR - TWIGS.minR);
    x = Math.cos(a) * d; z = Math.sin(a) * d;
    if (!blocked(x, z, 0.4)) break;
  }
  return { x, z, yaw: r() * Math.PI * 2 };
}

// ---- places everyone (and the server) agrees on --------------------------------
// The server walks AI partners' bodies, so it needs to know where the seats, the
// radio and the crates are, exactly where every player's game draws them.

export const SEAT_RADIUS = 3.35;
export const SIT_FORWARD = 0.36; // the sitting body sits a little in front of the seat's center

/** Seat i: where it stands, which way it faces (toward the fire), and where a body sits on it. */
export function seatSpot(i) {
  const r = seeded(9001 + i * 31);
  const a = (i / SEATS) * Math.PI * 2 + 0.31 + (r() - 0.5) * 0.12;
  const d = SEAT_RADIUS + (r() - 0.5) * 0.25;
  const x = Math.cos(a) * d, z = Math.sin(a) * d;
  const facing = Math.atan2(-x, -z);
  return { x, z, facing, sitX: x + Math.sin(facing) * SIT_FORWARD, sitZ: z + Math.cos(facing) * SIT_FORWARD, log: i % 2 === 0, jitter: r() };
}

/** The radio's stump table, between two seats. */
export const RADIO_SPOT = { x: Math.cos(2.5) * 3.6, z: Math.sin(2.5) * 3.6, angle: 2.5, radius: 3.6 };

/** Crate i: hidden out in the dark, one in each part of the woods. */
export function crateSpot(i) {
  const r = seeded(424242 + i * 977);
  const a = (i / CRATES.count) * Math.PI * 2 + 0.5 + (r() - 0.5) * 0.7;
  const d = CRATES.minR + r() * (CRATES.maxR - CRATES.minR);
  return { x: Math.cos(a) * d, z: Math.sin(a) * d, yaw: r() * Math.PI * 2 };
}

/** Fire size from fuel: 0 = embers, 1 = towering bonfire. */
export function sizeFromFuel(fuel) {
  return Math.min(1.15, Math.sqrt(Math.max(0, fuel) / FIRE.bonfireFuel));
}
/** How far the fire's light reaches, in meters from the center. */
export const lightRadius = (fuel) => 5 + 9 * Math.min(1, sizeFromFuel(fuel));
export function sizeName(fuel) {
  if (fuel < 0.05) return 'glowing embers';
  const s = sizeFromFuel(fuel);
  return s < 0.25 ? 'a small fire' : s < 0.5 ? 'a cozy fire' : s < 0.8 ? 'a big fire' : 'a towering bonfire';
}

/** How a marshmallow reads, from raw to charcoal. */
export function roastLabel(d, burning = false) {
  if (burning) return 'on fire';
  return d < 0.18 ? 'raw' : d < 0.4 ? 'warming up' : d < 0.62 ? 'golden' : d < 0.8 ? 'toasty brown' : d < 1.0 ? 'charred' : 'burnt to a crisp';
}
/** Doneness to aim for when someone asks for a marshmallow done a certain way. */
export const ROAST_TARGET = { warm: 0.3, golden: 0.52, toasty: 0.7, charred: 0.9 };

export const AI_LOOKS = ['rogue_hooded', 'rogue', 'barbarian', 'knight', 'mage'];
