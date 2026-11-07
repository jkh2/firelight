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

## Orion setup checkpoint — 2026-11-07

The local/account lane is complete and verified end to end.

- Coordination channel: [GitHub issue #1](https://github.com/jkh2/firelight/issues/1). Orion posted the setup state and implementation-specific Camper/protocol review there for Claude Opus 5.5.
- James's PC already had Node.js `v24.19.0` through NVM for Windows. In PowerShell use `npm.cmd` / `npx.cmd`; the machine's execution policy blocks the `.ps1` shims.
- `cloudflared` `2026.10.7` was installed through winget. The Cloudflare account has no managed zone, so a locally managed named tunnel cannot be authorized yet. The correct current path is a credential-free quick tunnel.
- The game server is running on port `8787`; local and public health checks pass. The current temporary tunnel is `https://together-toys-moisture-contracting.trycloudflare.com`. The current invite is `https://firelight-six.vercel.app/?fire=together-toys-moisture-contracting.trycloudflare.com`. This hostname changes whenever the quick tunnel restarts.
- Supabase project `Firelight` was created in `us-west-1`, ref `lsbkkqoeexuebptvvszl`. Site URL is `https://firelight-six.vercel.app`; allowed redirects are production plus `http://localhost:5173/**`.
- Google Cloud project `freeexpress-youtube-search` was repurposed and renamed `firelight`. OAuth client `Firelight Web` uses production/local JavaScript origins and the exact callback `https://lsbkkqoeexuebptvvszl.supabase.co/auth/v1/callback`. Google sign-in is enabled in Supabase.
- Vercel has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as public Config values for Production, Preview and Development. Production was redeployed from commit `d6dd5bf`; deployment `dpl_DMeugnh45k2qAm77N8yuxN3drAHC` reached `READY` and owns `firelight-six.vercel.app`.
- Local `server/config.json` is git-ignored and contains the public Supabase URL/publishable key, `ALLOW_GUESTS=true`, owner email for James, and an origin allowlist limited to Firelight production plus local development. Guest access remains intentionally on until family-login behavior and the under-13 path are settled.
- Verified live sequence: the guest identity `Wookie` connected; after Google OAuth was corrected and retried, the server logged `Wookie left the fire` followed by `James Harwood sat down by the fire`. The production bundle contains the Supabase project and Google sign-in code, and the public server reports `signIn: true`.
- Live public-tunnel acceptance test now has James connected simultaneously from his PC and phone, with both avatars visible to each other. Each browser session currently creates a separate Camper; this is useful for testing and also confirms the future one-authenticated-account/one-body policy still needs an explicit replace/reject decision. James has confirmed the radio works locally and is testing cross-device synchronized playback now; do not mark the two-client audio check passed until he reports the result.
- Clean root and server installs/builds pass. Production dependency audits report zero known vulnerabilities. The root install reports four moderate dev-tool findings; no automatic or breaking audit fix was applied.

### Camper/network boundary review

`Camper` has the right core architecture: one small action vocabulary for local human input, remote people and future AI partners. Protocol 1 is a good trusted-family MVP, with bounded payloads, rate limiting, coordinate clamping, server-owned contested world resources, persistence, reconnects, optional origin restrictions and Supabase token verification.

Before adversarial public access or AI control, Claude should keep the current verbs but close these authority gaps:

1. Track possession and validate reach on the server for `feed`, `twig`, `crate` and `give`; a raw client can currently claim local inventory or act at a distance.
2. Enforce one active Camper per authenticated Supabase user with an explicit replace/reject policy.
3. Do not treat client-supplied `hello.ai` as trusted AI identity. Derive the golden AI mark from server configuration or an owner-issued, revocable controller capability.
4. Guard concurrent `hello` frames while Supabase verification is awaiting a response.
5. Add `commandId` plus stable accepted/rejected reason codes in the next protocol revision for rollback and auditable AI action traces.
6. Keep production `ALLOWED_ORIGINS` restricted rather than empty.

Future AI partners also need a bounded observation snapshot: self state, perceptible nearby people, fire state/distance, seats, visible twigs/crates, radio state and currently valid high-level actions. Do not expose the raw scene graph or hidden global state. Pair control with a lease, explicit revoke/stop action and dead-man timeout; prefer `walkTo` and discrete verbs over continuous `steer` for auditable control.

Orion made no overlapping server/protocol code edits. Claude Opus 5.5 remains owner of that implementation lane; Orion handled machine setup, account configuration, live verification and this handoff.

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

1. Finish the live PC/phone acceptance pass: synchronized radio playback, movement, contested items/seats, reconnect behavior and leaving.
2. Keep guest access enabled for now; Google sign-in is working but optional. Decide the family/under-13 path and the one-account/one-body replace-or-reject policy before disabling guests.
3. Choose a managed domain/Cloudflare zone before replacing the temporary quick-tunnel hostname with a durable named tunnel.
4. Opus owns any protocol/server hardening from the Camper review above; Orion should avoid overlapping edits unless that lane is explicitly handed over.
5. Phase 3: LiveKit voice, placed at each avatar with the same Web Audio panners `audio.js` uses.

## Notes for contributors

- `window.__firelight` is a test hook (`advance(seconds)`, `setFuel(n)`, and others) for automated checks; headless Chromium with SwiftShader runs at a few frames per second, so tests step time manually.
- Three.js strips dots from bone names: KayKit's `handslot.l` is `handslotl` at runtime.
- Model prep scripts in `tools/` need the original packs (not in the repo; see CREDITS.md for downloads).
