# Handoff

Live baton for whoever picks up Firelight next, human or AI partner. Update it when you stop.

**Project brief:** "Firelight — Project Brief & Build Plan" (James's Claude Doc). This file holds what changed since that brief was written.

## State as of 2026-11-06 (Claude, claude.ai session)

**Phase 0 (setup): done.** Repo `jkh2/firelight`, Vite + Three.js, live at https://firelight-six.vercel.app (Vercel auto-deploys every push to `main`).
**Phase 1 (the fire, single player): built, awaiting James's judgment on his phone.**

Working:
- Dark clearing with a CC0 forest (Quaternius MegaKit), rolling hills beyond, stars and shooting stars
- Fire driven by fuel (twigs): grows to a towering bonfire, burns down to embers that never go out, rekindles from one twig
- KayKit avatars with walk, run, sit, pick up and throw animations; a choice of five looks on the join card
- Torch (F or button) with its own flame and light; twigs to gather (carry 5), thrown in an arc onto the fire
- Ring of 10 seats (low camp chairs and logs); sitting locks the camera to face the fire
- A camp at the edge: tent, backpack, woodpile, axe, a pot by the stones
- Radio on a stump table: paste a YouTube link and it plays, with volume by distance
- Marshmallows: hidden crates, roast on a twig, eat, toss the stick on the fire; give/receive actions ready for Phase 2
- Animals that never harm: wolves (eyeshine, circle in the dark, flee the torch), a twig-stealing fox, a grazing deer, fireflies; distant wolf howls
- Procedural sound: fire roar and crackle, crickets, wind, owl, twig sounds, all positioned in 3D
- PWA manifest and icon so it installs with "Add to Home Screen"
- Adaptive resolution if a phone struggles

## Phase 2 (together): built and tested locally, waiting on James's PC

- `server/`: the Node.js game server (see `server/README.md` to run it). It owns the fire's fuel, twigs, crates, seats and radio; saves to `server/saves/`; checks Google sign-in through Supabase once configured; guests with a name until then.
- `shared/rules.js`: rules both sides share (burn rate, counts, seeded twig spots).
- `src/net.js`, `src/multiplayer.js`, `src/remote.js`: the connection, the sync, and other people's avatars with name tags (AI partners get a golden ב).
- `src/auth.js`: "Sign in with Google", switched on by the `VITE_SUPABASE_*` build settings.
- Invite link: `https://firelight-six.vercel.app/?fire=<tunnel host>`. Without `?fire=`, Firelight stays single player.
- Tested with two browsers against a local server: avatars move for each other, one shared fire, twig and seat contention, the radio, giving marshmallows both ways, and leaving.
- Animals are still local to each player.
- Interface details for Orion: `docs/phase2-interface.md` (my session couldn't post on issue #1).

**Orion's part (from issue #1):** start the server on James's PC, run the quick tunnel, send the link; then Supabase with Google sign-in. Put the two public values into Vercel as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and into `server/config.json` as `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

## Decisions made after the brief

- **Sign-in, not secret links.** James wants people to join with Google (and Facebook later): if the fire has room, you're in. Plan: Supabase Auth with Google first; Facebook after Meta's app review; consider Apple. The game server verifies the session. The fire's owner can kick or ban an account.
  - Open question: James's grandkids. Google accounts for children under 13 (Family Link) often can't sign in to third-party apps. Likely answer: a parent signs in and brings the kids on the same device, or invited guest seats. Decide before Phase 2 ships.
- **Radio** (James's idea): YouTube embeds via the official IFrame API. Phase 2 syncs `{videoId, startedAt}` through the server so everyone hears the same moment; `Radio.play(videoId, startedAt)` already supports it. The embedded player must stay visible and at least 200×200 (YouTube's rules), so it lives in the "now playing" card.
- **No guns or combat.** We talked about it and agreed: sticks, quiet walks, and talking.
- **Marshmallows** (James's design): found in hidden crates that refill on their own, like manna; any carried twig becomes the roasting stick; the stick can go on the fire afterward. `Camper.give(other, 'roasted' | 'raw')` and `eatTreat()` exist for handing marshmallows to others; the tap-an-avatar menu arrives with Phase 2.
- **Animals never hurt anyone.** Wolves circle closer in the dark when your torch is off and back off when it's lit; a fox can steal a twig; a deer grazes at the light's edge. Agreed: the dark has a little bite, but no harm, because grandkids will be at this fire.
- **Survival layer idea** (James): marshmallows as food, a canteen filled at the lake, hunger and thirst. Proposed shape: an optional per-fire "survival mode" the owner can turn on, or a gentler warmth mechanic (cold out in the dark, warmed by the fire, a hot marshmallow or canteen drink warms faster) so nothing ever pulls people away from talking. Not decided.
- **The core loop** (James, in his words): wander off from the fire into the dark to explore, then feel the reward of returning to the warm light and the people gathered there. Everything out in the dark (twigs, crates, animals) should serve that.
- **Expand the world when the time is right.** Grow with trails out of the clearing to places worth finding (the lake, a ridge with the whole sky, an old cabin), keeping the fire close and warm.
- **Future ideas, not scheduled:** a path to a dark lake with the raft (Survival Pack has `Raft` and `Raft_Paddle`); AI partners joining as avatars through the same `Camper` actions.

## Next

1. James plays Phase 1 on his phone and PC and judges the feel. Tune from his notes.
2. Phase 2: run the server on James's PC with a tunnel; first family fire; then Supabase Google sign-in and ALLOW_GUESTS=false.
3. Phase 3: LiveKit voice, placed at each avatar with the same Web Audio panners `audio.js` uses.

## Notes for contributors

- `window.__firelight` is a test hook (`advance(seconds)`, `setFuel(n)`, and others) for automated checks; headless Chromium with SwiftShader runs at a few frames per second, so tests step time manually.
- Three.js strips dots from bone names: KayKit's `handslot.l` is `handslotl` at runtime.
- Model prep scripts in `tools/` need the original packs (not in the repo; see CREDITS.md for downloads).
