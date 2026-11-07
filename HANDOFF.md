# Handoff

Live baton for whoever picks up Firelight next, human or AI partner. Update it when you stop.

**Project brief:** "Firelight — Project Brief & Build Plan" (James's Claude Doc). This file holds what changed since that brief was written.

## State as of 2026-11-06 (Claude, claude.ai session)

**Phase 0 (setup): done.** Repo `jkh2/firelight`, Vite + Three.js.
**Phase 1 (the fire, single player): built, awaiting James's judgment on his phone.**

Working:
- Dark clearing with a CC0 forest (Quaternius MegaKit), rolling hills beyond, stars and shooting stars
- Fire driven by fuel (twigs): grows to a towering bonfire, burns down to embers that never go out, rekindles from one twig
- KayKit avatars with walk, run, sit, pick up and throw animations; a choice of five looks on the join card
- Torch (F or button) with its own flame and light; twigs to gather (carry 5), thrown in an arc onto the fire
- Ring of 10 seats (low camp chairs and logs); sitting locks the camera to face the fire
- A camp at the edge: tent, backpack, woodpile, axe, a pot by the stones
- Radio on a stump table: paste a YouTube link and it plays, with volume by distance
- Procedural sound: fire roar and crackle, crickets, wind, owl, twig sounds, all positioned in 3D
- PWA manifest and icon so it installs with "Add to Home Screen"
- Adaptive resolution if a phone struggles

## Decisions made after the brief

- **Sign-in, not secret links.** James wants people to join with Google (and Facebook later): if the fire has room, you're in. Plan: Supabase Auth with Google first; Facebook after Meta's app review; consider Apple. The game server verifies the session. The fire's owner can kick or ban an account.
  - Open question: James's grandkids. Google accounts for children under 13 (Family Link) often can't sign in to third-party apps. Likely answer: a parent signs in and brings the kids on the same device, or invited guest seats. Decide before Phase 2 ships.
- **Radio** (James's idea): YouTube embeds via the official IFrame API. Phase 2 syncs `{videoId, startedAt}` through the server so everyone hears the same moment; `Radio.play(videoId, startedAt)` already supports it. The embedded player must stay visible and at least 200×200 (YouTube's rules), so it lives in the "now playing" card.
- **No guns or combat.** We talked about it and agreed: sticks, quiet walks, and talking.
- **Future ideas, not scheduled:** a path to a dark lake with the raft (Survival Pack has `Raft` and `Raft_Paddle`); AI partners joining as avatars through the same `Camper` actions.

## Next

0. **Connect Vercel** (needs James's go-ahead or two clicks in the Vercel dashboard: Add New → Project → import `jkh2/firelight`; framework Vite, defaults are right). Until then a private single-file preview lives as a claude.ai artifact; the radio can't reach YouTube there.
1. James plays Phase 1 on his phone and PC and judges the feel. Tune from his notes.
2. Phase 2: Node.js game server (WebSockets) on James's PC behind a Cloudflare Tunnel, Supabase Google sign-in, and sync of avatars, twigs, fire fuel, seats, radio and torch. `Camper` actions become the network messages.
3. Phase 3: LiveKit voice, placed at each avatar with the same Web Audio panners `audio.js` uses.

## Notes for contributors

- `window.__firelight` is a test hook (`advance(seconds)`, `setFuel(n)`, and others) for automated checks; headless Chromium with SwiftShader runs at a few frames per second, so tests step time manually.
- Three.js strips dots from bone names: KayKit's `handslot.l` is `handslotl` at runtime.
- Model prep scripts in `tools/` need the original packs (not in the repo; see CREDITS.md for downloads).
