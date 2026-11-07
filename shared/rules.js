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
