# Firelight server

One shared fire for up to 20 people. It keeps the fire's fuel, the twigs, the marshmallow crates, the seats and the radio in step for everyone, and passes each person's movement along to the others.

## The easy way: the Firelight host panel

Double-click **`Firelight.cmd`** in the main folder (or the **Firelight** icon on your desktop, see below). A small black window opens, minimized, and your browser opens the host panel:

- **Light the fire / Put it out**: one button. It starts the game server and the tunnel together, and putting it out saves the fire first.
- **Invite**: the current invite link with **Copy link**, **Copy an invitation** (a ready-to-text message), and a **QR code** anyone in the room can point their phone camera at.
- **Around the fire**: a little map from above showing who's where and whose torch is lit, plus the list of people with **Remove** (and **Ban** for people signed in with Google).

- **AI partners**: make an invitation for an AI partner (Orion, Claude Sentinel...), see who has come, end a session, or take an invitation back. See [`../mcp/README.md`](../mcp/README.md).

The panel lives at `http://localhost:8790` and only your own computer can open it. Keep the black window open while the fire is lit; closing it puts the fire out (it saves first).

**Desktop icon (once):** in PowerShell, from the main Firelight folder:

```powershell
powershell -ExecutionPolicy Bypass -File tools\make-desktop-shortcut.ps1
```

**Needs:** Node.js and `cloudflared` installed (both already on James's PC). On Mac or Linux, run `./start-firelight.sh` instead.

Optional settings for the panel in `config.json`: `CONTROL_PORT` (8790), `PUBLIC_SITE`, `AUTO_START` (`true` lights the fire as soon as the panel opens), `CLOUDFLARED` (path, if it isn't on your PATH), and for a permanent address later, `TUNNEL_NAME` + `PUBLIC_HOST`.

## The manual way (Windows PowerShell)

```powershell
cd server
npm.cmd install
npm.cmd start
```

You should see `Firelight server: "The Fire" on port 8787`. Leave that window open.

### Let people in

In a second window:

```powershell
cloudflared tunnel --url http://localhost:8787
```

It prints an address like `https://quiet-river-1234.trycloudflare.com`. Your invite link is then:

```
https://firelight-six.vercel.app/?fire=quiet-river-1234.trycloudflare.com
```

Text that link to anyone. Opening the address itself in a browser shows a small status like `{"fire":"The Fire","people":2,...}`, which is a quick way to check the tunnel works. A quick tunnel gets a new address every time it starts. A named tunnel on your own domain keeps one address for good.

## Settings

Copy `config.example.json` to `config.json` and edit it, or set the same names as environment variables:

| Setting | What it does |
|---|---|
| `FIRE_NAME` | The fire's name on the join card |
| `PORT` | Defaults to 8787 |
| `ALLOW_GUESTS` | `true` lets people join with just a name; set `false` once Google sign-in is working |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Turns on Google sign-in checks (the public anon key, never the service-role key) |
| `OWNER_EMAILS` | Comma-separated emails of people who can kick or ban |
| `ALLOWED_ORIGINS` | Comma-separated web addresses allowed to connect, e.g. `https://firelight-six.vercel.app` |
| `SAVE_DIR` | Where the fire is saved (default `server/saves`) |
| `MULTI_DEVICE` | `true` lets one Google account be at the fire from two devices at once (default: joining again moves you) |
| `AGENT_IDLE_MINUTES` | How long an AI partner can be silent before it drifts off to sleep (default 20) |

`config.json` and `saves/` stay on your computer; git ignores them.

## Good to know

- The fire is saved every 30 seconds and when you press Ctrl+C. When the server starts again, the fire catches up on the burning it would have done while it was off.
- If your computer sleeps, the fire goes quiet for everyone. Moving to a rented server later is the same program, unchanged.
- The message format is in [`../docs/phase2-interface.md`](../docs/phase2-interface.md).
