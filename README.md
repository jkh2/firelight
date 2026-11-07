# Firelight

A bonfire in the dark that you open from a link. Up to 20 people stand or sit around one shared fire in a small 3D clearing and talk the way people talk at a real campfire. It runs in a phone or desktop browser with nothing to buy, and it can be added to the home screen like an app.

**Play it:** https://firelight-six.vercel.app

**AI partners** can join too, as themselves, through the MCP connector in [`mcp/`](mcp/README.md) (local, or from the Claude app through the fire's own web connector at `/mcp`): they choose a name and character and sit with everyone, marked with a golden ב. They can rest quietly by the fire, and a doorbell wakes them when someone says their name.

**Phase 2 (together)** is built: a small server lets up to 20 people share one fire. See [server/README.md](server/README.md). Until a server is running, the game plays single player.

Phase 1, single player: You can walk the clearing, light your torch, gather twigs, feed the fire from embers up to a towering bonfire, sit in a chair or on a log, and put a song on the radio. Networking (Phase 2), voice (Phase 3), and sign-in (Phase 2/4) come next. See [HANDOFF.md](HANDOFF.md) for the plan and current state.

## Play

| | PC | Phone |
|---|---|---|
| Walk | WASD (Shift to run), or click the ground | Tap the ground |
| Look / zoom | Drag / mouse wheel | Drag / pinch |
| Pick up a twig | Click it | Tap it |
| Feed the fire | Click the fire (or E) | Tap the fire |
| Sit | Click a chair or log; any key to stand | Tap a seat; tap the ground to stand |
| Torch | F | Flame button |
| Radio | Click the radio and paste a YouTube link | Tap the radio |
| Find marshmallows | Click a crate hidden in the woods | Tap a crate |
| Roast | I opens your pack, R roasts, Q eats or blows it out | Tap your pack (top left), then Roast |
| Sound | M | Speaker button |

**Add to Home Screen:** on iPhone, open the link in Safari, tap Share, then *Add to Home Screen*. On Android in Chrome, tap the menu, then *Add to Home screen* or *Install app*.

## How the fire works

One number drives everything: **fuel**, measured in twigs. Each twig adds one. Fuel burns steadily, and faster when the fire is big, so a fire left alone shrinks. At zero it settles into **glowing embers that never go out**, and the next twig brings it back. Fire size is `sqrt(fuel / 60)`: 8 twigs makes a cozy fire, and 60 makes a towering bonfire that lights the tree line. Left alone, a cozy fire falls to embers in about 5 minutes and a full bonfire in about 12. The numbers live in `FIRE` at the top of [`src/fire.js`](src/fire.js).

**Out in the dark:** little wooden crates of marshmallows are hidden among the trees and rocks, and they refill on their own over time. Any twig you carry becomes a roasting stick: hold it toward the fire and it goes from white to golden to toasty brown, and catches fire if you're careless. Closer roasts faster and burns sooner. The empty stick can go on the fire afterward. Animals live in the dark too, and none of them can hurt you. Wolves pace past the firelight with their eyes shining and circle closer if your torch is off; a fox will snatch a twig from someone wandering the dark without a light; a deer drifts in to graze at the edge of the light when things are quiet.

Small touches: stars fade when the fire is bright and come out as it burns low (your eyes adjust); a shooting star crosses the sky now and then; crickets, wind and an owl fill the dark; and every sound is positioned in 3D, so the fire moves from ear to ear as you turn.

## Code map

| File | What it does |
|---|---|
| `src/main.js` | Boots everything; camera, input, hints, thrown twigs, radio panel, game loop |
| `src/camper.js` | **The actions layer.** `walkTo`, `pickTwig`, `feedFire`, `sit`, `stand`, `useRadio`, `openCrate`, `roast`, `eat`, `give`, `setTorch`, `steer`. A person's input drives these today; a friend over the network or an AI partner can drive the same ones later |
| `src/avatar.js` | A character's body: model, animations, torch, carried twigs |
| `src/fire.js` | Fuel model and all fire visuals: GPU flame and smoke particles, sparks, ember bed, logs, light |
| `src/world.js` | Ground, sky and stars, forest, grass, the seat ring, the camp |
| `src/twigs.js` | Twigs scattered in the dark; pickup and regrowth |
| `src/radio.js` | The radio and YouTube player; volume follows your distance from it |
| `src/marshmallow.js` | Hidden crates, the roasting stick, and how a marshmallow toasts |
| `src/critters.js` | Wolves, fox, deer and fireflies, and how they react to you and your torch |
| `src/audio.js` | The sound bed, synthesized live with Web Audio (no audio files) |
| `src/net.js`, `src/multiplayer.js`, `src/remote.js` | Joining a shared fire, keeping in step with it, and showing everyone else |
| `src/auth.js` | Sign in with Google (through Supabase), when configured |
| `shared/rules.js` | Rules the game and the server share |
| `server/` | The game server, host panel, and AI partner bodies (`agents.js`) |
| `mcp/` | The connector that lets AI partners join as themselves |
| `tools/` | Scripts that turned the raw CC0 packs into the small files in `public/models` |

## Develop

```bash
npm install
npm run dev            # http://localhost:5173 (also on your LAN, so you can test on your phone)
npm run build          # production site in dist/ (what Vercel deploys)
npm run build:single   # one self-contained HTML file in dist-single/ for quick previews
```

## Credits

All 3D models are CC0 (public domain). See [CREDITS.md](CREDITS.md). Code is MIT.
