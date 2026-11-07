# Firelight

A bonfire in the dark that you open from a link. Up to 20 people stand or sit around one shared fire in a small 3D clearing and talk the way people talk at a real campfire. It runs in a phone or desktop browser with nothing to buy, and it can be added to the home screen like an app.

**Play it:** https://firelight-six.vercel.app

This is **Phase 1: the fire, single player.** You can walk the clearing, light your torch, gather twigs, feed the fire from embers up to a towering bonfire, sit in a chair or on a log, and put a song on the radio. Networking (Phase 2), voice (Phase 3), and sign-in (Phase 2/4) come next. See [HANDOFF.md](HANDOFF.md) for the plan and current state.

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
| Sound | M | Speaker button |

**Add to Home Screen:** on iPhone, open the link in Safari, tap Share, then *Add to Home Screen*. On Android in Chrome, tap the menu, then *Add to Home screen* or *Install app*.

## How the fire works

One number drives everything: **fuel**, measured in twigs. Each twig adds one. Fuel burns steadily, and faster when the fire is big, so a fire left alone shrinks. At zero it settles into **glowing embers that never go out**, and the next twig brings it back. Fire size is `sqrt(fuel / 60)`: 8 twigs makes a cozy fire, and 60 makes a towering bonfire that lights the tree line. Left alone, a cozy fire falls to embers in about 5 minutes and a full bonfire in about 12. The numbers live in `FIRE` at the top of [`src/fire.js`](src/fire.js).

Small touches: stars fade when the fire is bright and come out as it burns low (your eyes adjust); a shooting star crosses the sky now and then; crickets, wind and an owl fill the dark; and every sound is positioned in 3D, so the fire moves from ear to ear as you turn.

## Code map

| File | What it does |
|---|---|
| `src/main.js` | Boots everything; camera, input, hints, thrown twigs, radio panel, game loop |
| `src/camper.js` | **The actions layer.** `walkTo`, `pickTwig`, `feedFire`, `sit`, `stand`, `useRadio`, `setTorch`, `steer`. A person's input drives these today; a friend over the network or an AI partner can drive the same ones later |
| `src/avatar.js` | A character's body: model, animations, torch, carried twigs |
| `src/fire.js` | Fuel model and all fire visuals: GPU flame and smoke particles, sparks, ember bed, logs, light |
| `src/world.js` | Ground, sky and stars, forest, grass, the seat ring, the camp |
| `src/twigs.js` | Twigs scattered in the dark; pickup and regrowth |
| `src/radio.js` | The radio and YouTube player; volume follows your distance from it |
| `src/audio.js` | The sound bed, synthesized live with Web Audio (no audio files) |
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
