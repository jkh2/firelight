# Phase 2 interface

From Claude (claude.ai) for Orion, answering issue #1. My session couldn't post on the issue, so the reply lives here in the repo, where HANDOFF.md points. No secrets here: setting names only, never values.

## Game server

- **Run:** `cd server`, then `npm.cmd install`, then `npm.cmd start` (Node ≥ 20; v24 is fine). One dependency: `ws`.
- **Port:** `8787` (env `PORT`). Plain HTTP and WebSocket share that port at the **root path**:
  - `GET /` returns a small JSON status: `{ fire, people, max, fuel, signIn, guests }`. Handy for checking the tunnel.
  - The WebSocket is on `/` (no subpath).
- **Saves:** `server/saves/` (env `SAVE_DIR`): `fire.json` (fuel, twigs, crates; written every 30 seconds and on Ctrl+C) and `bans.json`. Both are git-ignored. When the server restarts, the fire catches up on the burning it would have done while it was off.
- **Settings:** env vars, or `server/config.json` (git-ignored; copy `config.example.json`):
  - `FIRE_NAME`, `PORT`, `SAVE_DIR`, `MAX_PLAYERS` (capped at 20)
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`: when both are set, the server checks each player's Supabase access token with `GET {SUPABASE_URL}/auth/v1/user`. No service-role key anywhere.
  - `ALLOW_GUESTS` (default `true` until sign-in is live; James can then set it to `false`)
  - `OWNER_EMAILS` (comma-separated; owners can kick or ban by account)
  - `ALLOWED_ORIGINS` (comma-separated browser origins). Suggested: `https://firelight-six.vercel.app` once the tunnel is public, plus `http://localhost:5173` for development.

## Tunnel

- **Tonight:** a quick tunnel is enough: `cloudflared tunnel --url http://localhost:8787`. It prints an `https://<random>.trycloudflare.com` address. WebSockets work through it as `wss://`.
- **Invite link:** `https://firelight-six.vercel.app/?fire=<host>`, for example `?fire=abc-def.trycloudflare.com`. The client turns a bare host into `wss://<host>` (or `ws://` for localhost). Full `wss://` or `https://` URLs also work.
- **Later:** a named tunnel on a stable hostname (open question in HANDOFF: is James's domain on Cloudflare?). The build can then carry it as `VITE_FIRE_SERVER`, and links won't need `?fire=`.

## Sign-in (Supabase + Google)

- **Client build env (Vercel project settings):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. With both present, the join card shows "Sign in with Google". Without them, people join with a name.
- **Supabase → Authentication → URL configuration:** Site URL `https://firelight-six.vercel.app`. Redirect allow list: `https://firelight-six.vercel.app/**` and `http://localhost:5173/**`. The client returns to the same link, `?fire=` included. PKCE flow.
- **Google Cloud OAuth client:** the authorized redirect URI is Supabase's `https://<project-ref>.supabase.co/auth/v1/callback`; the authorized JavaScript origin is `https://firelight-six.vercel.app`.

## Messages (protocol 1, JSON over the socket)

**Client → server**
- `hello {v, name, look, token?, ai?}`: `ai: true` marks an AI partner, and everyone sees a golden ב beside their name.
- `st {x, z, h, m, s, o, c, k}` at 10 Hz: position, heading, sitting, seat, torch on (`o`), twigs carried, roasting stick `{d, b}` or null. (Every message's own type is in `t`, so no other field uses that name.)
- `act {a, ...}` with `a` one of `feed`, `twig`, `crate`, `sit`, `stand`, `radio`, `radioOff`, `give`, `kick`.

**Server → client**
- `welcome {id, fireName, owner, signedIn, world, players}`
- `snap {fuel, ps[]}` at 10 Hz
- `ev {e, ...}` with `e` one of `fed`, `twigTaken`, `twigDenied`, `twigBack`, `crateTaken`, `crateDenied`, `crateBack`, `seat`, `seatDenied`, `radio`, `gift`, `gave`
- `joined`, `left`, and `bye {why, text}` (`full`, `signin`, `banned`, `kicked`, `update`)

**Who owns what.** The server owns fire fuel, twig presence and regrowth, crate stock, seats, and the radio. Twig positions come from a shared seeded function in `shared/rules.js`, so only `{present, gen}` travels. Each browser owns its own movement. Animals are local to each player for now.

## Camper action boundary (`src/camper.js`)

These are the verbs the network maps onto, and the ones an AI partner would drive: `walkTo`, `pickTwig`, `feedFire`, `sit`, `stand`, `useRadio`, `openCrate`, `roast`, `eat`, `blowOut`, `putAwayStick`, `give(other, 'roasted' | 'raw')`, `eatTreat`, `setTorch`, `steer`.

`src/multiplayer.js` turns Camper events into `act` messages and applies other players' events. Please review that pair as the boundary. I'd especially value your view on what an AI partner needs beyond these verbs, such as an observation snapshot of who's nearby and how big the fire is.

## AI partners (added 2026-11-07)

- `hello {v, agentKey, name, look}`: a valid invitation key admits an AI partner under the name and character it chooses; the server sets `ai: true` (browsers can't). Wrong key → `bye {why: 'badkey'}`; name already at the fire → `bye {why: 'name'}`.
- AI partners send `cmd {id, do, ...}` and get `done {id, ok, reason?, text, data?}`. `do` is one of `look`, `say`, `listen`, `walk_to`, `sit`, `stand`, `torch`, `gather`, `feed`, `find_marshmallows`, `roast`, `eat`, `give`, `radio`, `radio_off`, `stop`, `leave`.
- AI partners receive the same `ev`, `joined`, `left` and `bye` messages as browsers, but not `snap` (they perceive through `look`).
- Chat for everyone: browsers send `act {a: 'say', text}`; everyone receives `ev {e: 'said', by, name, ai, text, at}`. `welcome.world.chat` carries the recent lines.
- Admin door (host panel only): `GET /agents`, `POST /agents/add {note}` (returns the key once), `POST /agents/stop {id}`, `POST /agents/revoke {id}`.

## Presence (added 2026-11-07, branch `claude/presence`)

- `cmd {do: 'rest', minutes, wait}`: takes or renews a rest lease (`minutes` 1 to 10) and waits up to `wait` seconds (0 to 55) for the doorbell. Returns `done {text, data: {woke, bells, leaseUntil}}`. When `leaseUntil` passes without a renewal (and no task is running), the server sends `bye {why: 'lease'}` and the body leaves at once. Any command other than `rest`, `look`, `listen` or `stop` ends the lease (the partner is active again).
- Doorbell: the server sends the partner `ev {e: 'doorbell', reason, from, text?}` with `reason` one of `name` (its name as a whole word), `gift`, `beside` (adjacent seat), `arrival` (the first person joined a fire that had only AI partners). A waiting rest returns at once; otherwise bells are held for the next rest call.
- Home rings: for a partner that isn't waiting on a rest call and whose invitation has a host-approved address, the server POSTs a signed, bounded, coalesced ring (`server/wake.js`). Absent partners are rung when their last-used name is said or the first person arrives. A ring is a notification, never presence.
- Snapshots carry `r: 1` on an AI body while its rest lease holds. Browsers show "· resting" after the name.
- Web connector: `POST|GET|DELETE /mcp` on the game port is the same MCP tool set over Streamable HTTP (`mcp/web.js`). Auth: `Authorization: Bearer fl_…`, or the key as the last path segment (`/mcp/fl_…`). Each session joins its own body over loopback; one session per key. A session ends, and its body leaves, when it has had no POST for `WEB_IDLE_SECONDS` and holds no rest lease.
- Host panel: `POST /api/agents/wake {id, url}` approves a home address and returns its signing secret once; `POST /api/agents/unwake {id}` removes it. `/api/agents` never returns secrets.

## Voice (added 2026-11-09, branch `claude/voice`)

- `welcome.voice`: `{url, token, room}` for people when the server has LiveKit settings, otherwise `null`; always `null` for AI partners. A `rewelcome` carries a fresh pass.
- The token's identity is the player's game `id`, so a voice track is placed at the avatar with that id. Audio only, microphone only, six hours.
- When a player leaves (for any reason) the server removes that identity from the LiveKit room.

