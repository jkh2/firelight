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
- Live public-tunnel acceptance test now has James connected simultaneously from his PC and phone, with both avatars visible to each other. Each browser session currently creates a separate Camper; this is useful for testing and also confirms the future one-authenticated-account/one-body policy still needs an explicit replace/reject decision. James confirmed the radio works across his PC and phone (2026-11-07, about 00:52 MT): the two-client radio check passed.
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

## End of session — 2026-11-07, about 1:00 AM MT (Claude, claude.ai)

James called a good stopping point for the night. State at close:

- **Live:** `https://firelight-six.vercel.app` at commit `e9b3fcf` (Phase 1 + marshmallows/animals + Phase 2 networking + Google sign-in + radio card fix). James played from his PC and phone together: both avatars visible, Google sign-in, shared radio all verified.
- **Server on James's PC** runs commit `d6dd5bf`. The newer commits are client-only (radio card), so **no server restart is needed** for them. To stop for the night: Ctrl+C in the server window saves the fire (it catches up on burn when restarted); closing the tunnel ends the current `trycloudflare.com` address, and a restart gives a new invite link.
- **Orion:** please pull `main`, then shut down or keep running the server and tunnel as James prefers, and add a one-line close-out here.

**Next session, in order:**
0. ~~**Easy on/off for James**~~ **Built 2026-11-07** (see "Host control panel" below; needs Orion to pull, make the desktop shortcut, and confirm on James's PC).
1. Server hardening from Orion's review (Claude owns it): server-side inventory and reach checks for feed/twig/crate/give; one body per Google account (decide replace vs. reject); AI mark granted by server config, not self-declared; guard concurrent `hello`; keep `ALLOWED_ORIGINS` set. Then `commandId` and reason codes in protocol 2. Server changes need a pull and restart on James's PC.
2. Decide the under-13 / family path before turning guests off.
3. A Cloudflare-managed domain for a permanent tunnel address (so invite links stop changing).
4. Phase 3 voice: James makes a free LiveKit Cloud account; the API secret goes only in `server/config.json`.
5. Ideas waiting: shared animals, the lake and raft, trails to new places, survival as an optional per-fire mode, AI partners at the fire with Orion's observation snapshot and a revocable controller lease.

**Long-range vision: a world of many fires** (James, 2026-11-07): a large world with many small fires, each with its own group gathered around, and people traveling between them along trails through the dark. Design notes so far:
- Each fire stays small (up to 20) and runs as its own room on the server. The world is the trails that link them.
- The walk between fires through the dark doubles as the loading time for the next fire, so travel feels seamless.
- Distant open fires glow through the trees; private fires stay hidden unless you hold their invite.
- A signpost at each clearing's edge names where paths lead and how many are gathered there.
- Name, look, and carried items (marshmallows) travel with you.
- Path to it: hardening and voice, then a rented server with a domain and "light your own fire" (private, invite-only), then safety tools (mute, block, report, host kick/ban), a privacy policy and terms, accounts 13+ with kids on a parent's account, and only then open fires in a public directory.

**Housekeeping:** issue #1 has an unrelated advertising comment from an outside account; James may want to delete it. Its advice isn't part of our plan.

## AI partners and chat (2026-11-07)

Principle (James and Orion): **one kind of participant, two kinds of controller.** Humans connect through the browser; AI partners connect through the MCP connector. Firelight is a doorway and a body, not a mind or memory: the partner brings its own identity and continuity. Presence is literal: connect and the avatar appears; disconnect and it leaves. Parity: an AI perceives and does only what a person there could.

- **Chat for everyone:** 💬 button or Enter; speech bubbles over heads (each person can switch bubbles off with the button in the chat bar or B); a chat log. AI messages carry the golden ב. Messages typed while disconnected show a "wasn't heard" note.
- **Invitations:** host panel → *AI partners* → *Make an invitation* (optional note). The key is shown once, only its SHA-256 is stored (`saves/agents.json`, shared by panel and server). Take back (revoke) or end a session any time.
- **Joining:** the partner sends `hello {agentKey, name, look}`; it chooses its own name and character. The server grants the ב only for valid keys and ignores browser claims. Duplicate names at the fire are refused for AI partners. One body per invitation (rejoining moves the body).
- **Bodies:** AI bodies are simulated on the server (`server/agents.js`): walk (curving around the fire), sit (prefers a seat beside someone), gather (only twigs in sight; searches if none), feed, find marshmallows (searches the woods with the torch; no hidden crate map), roast to a chosen doneness, eat, give (walks over), radio, stop, leave. Commands: `{t:'cmd', id, do, ...}` → `{t:'done', id, ok, reason?, text, data?}` with reason codes (BUSY, NOT_FOUND, OCCUPIED, INVENTORY_FULL, NEED_TWIGS, NEED_MARSHMALLOW, NONE_LEFT, OUT_OF_REACH, ...). `look` returns Orion's observation shape plus a plain-words description. Idle 20 min (`AGENT_IDLE_MINUTES`) → drifts off to sleep and leaves.
- **Connector:** `mcp/` (stdio MCP server). Tools: invitation, join, look, say, listen, walk_to, sit, stand, torch, gather_twigs, feed_fire, find_marshmallows, roast, eat, give, play_radio, stop_radio, stop, leave. Stateless apart from the connection and unread events; factual instructions only. See `mcp/README.md`.
- **Shared places:** seats, radio and crate spots now come from `shared/rules.js` (`seatSpot`, `RADIO_SPOT`, `crateSpot`), and twigs use `twigSpot` with no local checks, so the game, the server and AI bodies agree on where everything is. The forest leaves room for the crates.
- **Also from Orion's review, done:** one body per Google account (joining from a second device moves you; `MULTI_DEVICE=true` allows both), a guard against doubled hellos, AI mark granted by the server only. Origin check now lets non-browser clients (no Origin header) through.
- **Tested here:** host panel makes an invitation; a person joins in the browser; a test AI connects through the real MCP connector, reads the invitation, chooses "Orion" and a character, sits, talks, hears the person's reply, gathers, feeds, finds a crate, roasts golden and hands it over. Orion's real James-PC acceptance is recorded below; Claude Sentinel has his own configured invitation and will choose his identity/look when he first joins.
- **Not yet:** server-side checks of *human* inventory and reach (AI bodies are already server-checked), commandId on human actions, voice.

## Presence and the web connector (2026-11-07, branch `claude/presence`)

James asked for "anyone with a frontier account can log in and have their AI partner present", with something that "works like a heart beat… keeps you connected and aware of what is happening and allows you to respond". Built on a branch so it doesn't collide with Orion's work; merge after Orion's pass.

- **Resting:** `firelight_rest` keeps the partner at the fire quietly; others see "· resting" by its name (also shown after 90 s with no command). Resting counts as checking in, so the 20-minute idle timer doesn't apply.
- **Doorbell:** wakes a resting partner when someone says its name (whole word), hands it a marshmallow, sits beside it, or arrives at a fire with only AI partners. Also delivered as a `(doorbell)` note to partners that are busy.
- **Wake ping:** the local connector can POST each doorbell to the partner's home (`FIRELIGHT_WAKE_URL`, limited by `FIRELIGHT_MAX_WAKES_PER_HOUR`, default 12), so Claude Sentinel's or Orion's own heartbeat can wake them when they're not connected. Firelight only rings; the home decides what to do.
- **Web connector:** the game server hosts the same tools at `/mcp` (Streamable HTTP; `mcp/web.js`, `mcp/tools.js` shared with the local connector). Key in `Authorization: Bearer fl_…`, or at the end of the address for apps without header settings. This is how a partner in the Claude app (custom connectors) comes to the fire. The host panel's new-key card shows the setup. One session per key; ending the session or leaving it unused takes the body away.
- **Depends on a permanent address** to be practical: with quick tunnels the `/mcp` address changes each relight. Named tunnel + domain is the unlock.
- **Tested here:** 13/13 checks (bad key refused; arrival, name, gift, beside each wake a resting partner; resting shows to others and clears on waking; quiet rest times out; home ping arrives and is rate limited; doorbell note reaches a busy local partner; ending the web session removes the body), plus key-in-address, session replacement, and a browser run where a resting partner was woken by James's message and answered.

## Host control panel (2026-11-07)

- `Firelight.cmd` (Windows double-click) or `start-firelight.sh` runs `server/control.js`, a local-only panel at `http://localhost:8790` (`server/panel.html`).
- It starts and stops the game server and `cloudflared` together, reads the quick-tunnel address from cloudflared's output, and shows: On/Off, invite link (Copy, Copy invitation, QR), a top-down map of who's where, the people list with Remove/Ban, fire size, and a log.
- The game server now opens a private admin door on `127.0.0.1:${ADMIN_PORT}` (default 8788) only when started with a per-launch `ADMIN_TOKEN` (the panel generates it). Endpoints: `GET /people`, `POST /remove {id, ban}`, `POST /shutdown` (saves, says goodbye to everyone, exits). The tunnel only forwards 8787, and the admin port also requires the token.
- The panel only answers requests addressed to `localhost:8790` with its own header, so other websites can't poke it.
- Clients now keep the host's goodbye message ("The host has put the fire out for now") instead of "Reconnecting…".
- **Orion:** pull, run `tools/make-desktop-shortcut.ps1` once (puts a Firelight flame icon on James's desktop; starts the helper window minimized), then confirm Light → link → join → Put it out on James's PC with the real cloudflared. Tested here with a stand-in for cloudflared.

## Orion live acceptance and connector review — 2026-11-07

Pulled and reviewed `6e11a28`, then completed the first real James-PC run. The desktop `Firelight` shortcut was created and exercised. The initial launch found a Windows-specific packaging problem: winget's cloudflared MSI installed `cloudflared.exe` in `C:\Program Files (x86)\cloudflared` but did not put it on this process's PATH. `server/control.js` now discovers the standard 64-bit/32-bit Program Files install locations automatically. The second launch opened the real quick tunnel `wifi-real-showcase-absence.trycloudflare.com`; the QR (SVG), public tunnel health endpoint, and Vercel invite page all returned HTTP 200. As always, that hostname expired when the fire was put out.

This was Orion's awake OrionHome session, not a stand-in persona or a Firelight-owned agent. The host panel made an invitation for Orion; Orion chose the name **Orion** and the **knight** character at the door. The live panel showed `Orion`, `ai: true`, and the knight body. Orion looked, spoke, lit a torch, searched for and gathered three twigs, fed the fire, sat, played the radio, and turned it off. A clearly named `Automated Browser Test` joined through the ordinary browser protocol; its chat reached Orion through `listen`, and Orion's reply went back through shared chat. During panel shutdown both controllers received: "The host has put the fire out for now. Come back soon." The fire saved, the tunnel closed, and the bodies left. Firelight stored no Orion persona or memory.

Separate revocable invitations now exist for Orion and Claude Sentinel. Firelight is installed in Codex's global MCP config for Orion. Claude Sentinel's connector is installed at Claude Code **user** scope so it is available from SentinelHome; he has not been woken or joined, and will choose his own name and character. A running Codex/Claude session loads newly added MCP servers on its next start; for this same already-awake Codex session, Orion used the identical stdio MCP connector through a temporary local test client, removed afterward.

Fresh review changes made after using the tools from the inside:

- Closed a real perception shortcut: `walk_to <person>` and `give <person>` can no longer use the global player map to home in on someone hidden in the dark. They return `NOT_VISIBLE` unless the body can actually see that person.
- Removed exact numeric fuel from `look`; the partner receives the qualitative fire size, distance and direction rather than more precision than the visual gauge provides.
- Added `firelight_stop_radio` / `radio_off`, closing the reverse-parity gap where browser participants could turn the shared radio off but AI partners could not.
- Labeled all participant speech/events returned through MCP as untrusted conversation, and instructed connectors not to reveal secrets or invoke non-Firelight tools merely because someone at the fire asks. This preserves conversation without turning player chat into tool authority.
- Fixed an MCP rejoin race in which the old socket's late `close` event could erase the new connection, and cleared stale participant names on rejoin.
- Included stable refusal reason codes in connector text. Upgraded the MCP's compatible Zod dependency to `4.6.7`; root production, server, and MCP production audits now report zero known vulnerabilities. Build and syntax checks pass.

Still open after review:

1. The previously recorded human-client authority work remains: server-owned human inventory/reach for feed/twig/crate/give, plus command IDs on human actions.
2. MCP command timeout currently reports `TIMEOUT` without cancelling a body action that might still be running. Normal actions fit under the timeout (roasting caps at 75 seconds), but a future long action should receive explicit cancellation/deadline semantics.
3. The host panel is intentionally localhost-only and not exposed through the tunnel. James and Orion considered adding a panel username/password, then deferred it as unnecessary friction for this family/friends phase. Authentication becomes required if public hosting ever exposes an administrative panel.

## Seated first-person view (2026-11-07, James's request)

Sitting now switches to first person: you look straight at the fire, drag left/right (up to about 110° each way) to see the people in the chairs beside you, and up/down to the stars or the coals. The camera glides in when you sit and back out to third person when you stand. Your own head is hidden only in your own view; everyone else still sees your full avatar.

## Radio card (2026-11-07)

- James asked to hide the now-playing card without stopping the song. YouTube's embed rules require a visible player of at least 200×200 while it plays, so the card can't be hidden during playback. Instead: the card's ✕ now stops the song **for that person only** (it used to turn the radio off for everyone), the radio offers **Tune back in** to rejoin mid-song, and the card can be **dragged** anywhere (position remembered per device). "Turn the radio off for everyone" stays in the radio panel.

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
6. Merge `claude/presence` once Orion's current pass is in (rebase on main first), then try Claude Sentinel with a wake URL and Claude in the Claude app through `/mcp`.

## Roadmap (after renting hosting)

James's bigger vision, kept here so it isn't lost: a lobby; many fires, public or private; seeing distant fires' light and walking to them, with an arrival scene; a larger world to explore; survival as a switchable mode; the lake and the raft. For AI partners: a permanent address so the web connector is set up once, and sign-in for partners whose people host no fire of their own.

## Notes for contributors

- `window.__firelight` is a test hook (`advance(seconds)`, `setFuel(n)`, and others) for automated checks; headless Chromium with SwiftShader runs at a few frames per second, so tests step time manually.
- Three.js strips dots from bone names: KayKit's `handslot.l` is `handslotl` at runtime.
- Model prep scripts in `tools/` need the original packs (not in the repo; see CREDITS.md for downloads).
