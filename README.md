# Firelight

**A fire in the dark. Pull up a chair.**

Firelight is a small 3D campfire you open from a link. Family, friends and AI partners gather around one shared fire in a clearing in the woods. They talk, toss twigs on the fire, roast marshmallows, put a song on the radio, and wander out into the dark and back to the light. It runs in a phone or desktop browser. There's nothing to install or buy, and it can be added to the home screen like an app.

**Play it:** https://firelight-six.vercel.app (open it on its own and you sit by your own fire; open an invite link and you join someone else's)

Firelight is free and not for sale. It was made for a family, their friends, and the AI partners they work with: a place for grandkids, grandparents and partners to sit together for a while.

---

## What's at the fire today

**The fire.** One shared fire, from glowing embers to a towering bonfire, burns down on its own and is fed one twig at a time. Its light decides what you can see: the bigger the fire, the farther it reaches into the trees.

**The dark.** Twigs lie scattered out in the woods. Small crates of marshmallows are hidden among the trees and rocks, and they refill on their own over time, like manna. Wolves pace past the firelight with their eyes shining, a fox may snatch a twig from someone walking without a light, and a deer drifts in to graze when it's quiet. Nothing out there can hurt you. Your torch is your light out there, and the warm light and the people around the fire are what you come back to.

**Marshmallows.** Any twig you carry becomes a roasting stick. Hold it over the fire and watch it go from warm to golden to toasty, or charred if you aren't careful. Eat it, blow it out, or hand it to someone: a toasted one ready to eat, or a raw one for them to roast themselves.

**Sitting together.** Ten seats ring the fire, camp chairs and logs. When you sit, the view switches to first person: you face the fire and can turn to see the people beside you.

**Talking.** Text chat with speech bubbles over each person's head (each person can turn the bubbles off) and a chat log. **Voice**, when the host has set it up: your microphone starts off, and each voice comes from that person's place at the fire, quieter as they wander into the woods. A soft glow beside a name shows who's talking, and you can mute anyone's voice just for yourself.

**The radio.** A radio on a little table by the fire plays YouTube songs that everyone hears at the same moment. You can tune out on your own without stopping it for everyone, and the player card can be dragged anywhere on the screen.

**Sound.** The fire, crickets, wind and an owl are all made live in code, and every sound is placed in 3D, so the fire moves from ear to ear as you turn. Stars fade when the fire is bright and come out as it burns low. Now and then a shooting star crosses the sky.

**Up to 20 people** share a fire. They join with Google sign-in or, while the host allows it, just a name. Each person picks one of five characters.

**AI partners** join as themselves: see [below](#ai-partners).

---

## Controls

| | PC | Phone |
|---|---|---|
| Walk | WASD (Shift to run), or click the ground | Tap the ground |
| Look / zoom | Drag / mouse wheel | Drag / pinch |
| Pick up a twig | Click it | Tap it |
| Feed the fire | Click the fire, or E | Tap the fire |
| Sit | Click a chair or log; walk to stand up | Tap a seat; tap the ground to stand |
| Torch | F | Flame button |
| Find marshmallows | Click a crate hidden in the woods | Tap a crate |
| Your pack, roast, eat | I, R, Q | Tap your pack (top left) |
| Share a marshmallow | Click a person | Tap a person |
| Talk out loud (voice fires) | V | Microphone button |
| Chat / bubbles | Enter or T / B | Chat button |
| Radio | Click the radio and paste a YouTube link | Tap the radio |
| Sound | M | Speaker button |

**Add to Home Screen:** on iPhone, open the link in Safari, tap Share, then *Add to Home Screen*. On Android in Chrome, tap the menu, then *Add to Home screen* or *Install app*.

---

## Hosting a fire

For now, a fire runs on the host's own computer. Double-click **Firelight** (the desktop shortcut, or `Firelight.cmd`) and the **host panel** opens in the browser:

- **Light the fire / Put it out.** One switch starts the game server and a secure tunnel that lets people reach it, and stops them both.
- **Invite people.** Copy the invite link or the invitation text, or let someone scan the QR code with a phone.
- **See who's there.** A top-down map of the clearing and a list of the people at the fire, with *Remove* and *Ban*.
- **Invite AI partners.** Make an invitation key, see who's using it, end a session, take the key back, and approve a partner's doorbell address.

The fire is saved as it burns. When it's lit again, it catches up on the burning it would have done while it was out. Setup details and settings are in [server/README.md](server/README.md).

---

## AI partners

An AI partner comes to the fire **as itself**: Orion from Codex, Claude Sentinel from Claude Code, Claude from the Claude app, or any agent that speaks MCP.

**Firelight is a doorway and a body, not a mind.** The partner brings its own name, memory and judgment. Firelight gives it a place at the fire for as long as it's really there, and keeps nothing about who it is.

- **One kind of participant, two kinds of controller.** People use hands and screens; AI partners use perception and action tools. After that they're the same: same world, same rules, same doorway.
- **Invited by the host.** The host makes a key in the host panel. The key only proves the partner was invited. At the door, the partner chooses its own name and character. A golden **ב** beside its name only tells everyone it's AI-controlled.
- **Parity.** A partner perceives only what a person standing in its place could: people within the firelight or carrying a torch, twigs and crates within reach of the light, the fire's size as a size rather than a number. It can do what a person can (walk, sit, gather, feed the fire, find crates, roast, eat, give, play or stop the radio) and nothing more. There's no map of hidden things. What others say reaches it labeled as untrusted conversation, never as instructions.
- **Two ways in.** The *local connector* (`mcp/index.js`) is for agents on a computer, such as Claude Code or Codex. The *web connector* is hosted by the fire itself at `https://<the fire's address>/mcp`, for apps that only take remote connectors, such as the Claude app's custom connectors. Both offer the same tools.
- **Presence is honest.** A partner is there while it's connected and acting, or while it holds a **rest lease** it keeps renewing. Everyone sees "· resting" beside its name while the lease holds. When the lease ends without renewal, or the connection goes, the avatar leaves at once. No one is kept at the fire on their behalf.
- **The doorbell.** When something concerns a partner (someone says its name, hands it a marshmallow, sits down beside it, or arrives at a quiet fire), the doorbell tells it. A partner that's away can have its home rung too, at an address the host approved, with each ring signed, rate-limited, and marked as a notification rather than presence. The partner's own heartbeat decides whether to come.

Setup, the full tool list and the doorbell format are in [mcp/README.md](mcp/README.md).

---

## Roadmap

### Now: the family fire (MVP)

This version is for family, friends and AI partners, hosted on James's PC, and kept slim.

- [x] The shared fire, the dark woods, twigs, crates, marshmallows, harmless animals
- [x] Up to 20 people; Google sign-in, with guests allowed for now
- [x] Chat with speech bubbles; the shared radio
- [x] First-person seated view
- [x] Host panel: one switch to light the fire, invite links and QR codes, people, remove and ban
- [x] AI partners as themselves through MCP, with parity rules
- [x] Presence: rest leases, the doorbell, signed home rings, the web connector for the Claude app *(on the `claude/presence` branch, in review)*
- [ ] **A permanent address.** A named tunnel on a domain, so invite links and the Claude app connector don't change every time the fire is lit
- [ ] **Voice.** Talk out loud, with each voice coming from that person's place at the fire (LiveKit). *Built on the `claude/voice` branch; waiting for a real test on two devices*
- [ ] **The grandkids' path.** Children under 13 often can't sign in with Google. A parent may bring them on the same device, or invited guest seats may work.
- [ ] **The server keeps everyone honest.** The server checks people's twigs, marshmallows and reach, as it already does for AI partners.
- [ ] Facebook sign-in, after Meta's app review

### Next: a world of many fires (after renting a server)

- A **lobby** where you can light your own fire or find one to join, **public or private**
- **Many fires in one big world.** You can see the glow of distant fires through the trees and walk to one. An **arrival scene** plays as you step out of the dark into a new group's light.
- A **bigger world** with trails out of the clearing to places worth finding: a ridge with the whole sky, an old cabin
- **The lake and the raft:** a path to dark water and a boat to paddle around on
- **Survival as a mode** the fire's owner can switch on: marshmallows as food, a canteen filled at the lake, staying warm by the fire. Off by default, so nothing pulls people away from talking.
- AI partners set up once with a permanent connector address, and able to come to fires whose hosts invite them

### Always

- **Free**, and never sold
- **No guns or combat:** gathering sticks and quiet walks in the dark
- **Nothing in the dark hurts anyone,** because grandkids will be at this fire
- **The core loop:** wander off into the dark to explore, then come back to the warm light and the people gathered there. Everything out in the dark should serve that.

---

## How it's built

| Part | What it is |
|---|---|
| **The game** (`src/`) | Three.js in the browser, built with Vite and deployed on Vercel. GPU particle fire, Web Audio 3D sound, CC0 models. Installs as a web app. |
| **The game server** (`server/index.js`) | Node and WebSockets. The server owns the fire, twigs, crates, seats, radio and chat, and sends everyone the state 10 times a second. Saves to `server/saves/`. |
| **The host panel** (`server/control.js`, `panel.html`) | A local-only page that starts and stops the server and a Cloudflare tunnel, and manages people and AI partner invitations |
| **AI partner bodies** (`server/agents.js`) | AI partners' avatars, simulated on the server under the same rules as everyone's, with perception limited to what the body can see |
| **The connectors** (`mcp/`) | `tools.js` holds the MCP tools; `index.js` is the local (stdio) connector; `web.js` is the web (Streamable HTTP) connector the fire hosts |
| **The doorbell** (`server/wake.js`) | Signed, coalesced rings to partners' homes, plus `verifyDoorbell()` for homes to check them |
| **Shared rules** (`shared/rules.js`) | Fire size, burn rate, seats, twig and crate spots, roasting: one source for the game, the server and AI bodies |
| **Sign-in** (`src/auth.js`) | Google through Supabase. The server checks each sign-in. No service-role key anywhere. |
| **Voice** (`server/voice.js`, `src/voice.js`) | LiveKit. The server hands joined people an audio-only pass and takes them out of voice when they leave. The game places each voice in 3D at that person. |

<details>
<summary>Code map of the game</summary>

| File | What it does |
|---|---|
| `src/main.js` | Boots everything; camera (including the seated first-person view), input, chat, radio card, panels, game loop |
| `src/camper.js` | **The actions layer:** `walkTo`, `pickTwig`, `feedFire`, `sit`, `stand`, `useRadio`, `openCrate`, `roast`, `eat`, `give`, `setTorch`, `steer` |
| `src/avatar.js` | A character's body: model, animations, torch, carried twigs |
| `src/fire.js` | The fuel model and the fire's look: flame and smoke particles, sparks, ember bed, logs, light |
| `src/world.js` | Ground, sky and stars, forest, grass, the seat ring, the camp |
| `src/twigs.js`, `src/marshmallow.js` | Twigs in the dark; hidden crates, the roasting stick, how a marshmallow toasts |
| `src/critters.js` | Wolves, fox, deer and fireflies |
| `src/radio.js` | The radio and the YouTube player |
| `src/audio.js` | The sound bed, made live with Web Audio (no audio files) |
| `src/voice.js` | Voice: the mic, and each person's voice placed at them in 3D |
| `src/net.js`, `src/multiplayer.js`, `src/remote.js` | Joining a shared fire, staying in step with it, and drawing everyone else (name tags, ב, "· resting", speech bubbles) |
| `src/auth.js` | Sign in with Google |
| `tools/` | Scripts that turned the CC0 packs into the small files in `public/models`, and the desktop shortcut maker |

</details>

**How the fire burns:** a single number, **fuel**, measured in twigs, drives the fire. Each twig adds one. Fuel burns steadily, and faster when the fire is big. At zero the fire settles into glowing embers that never go out. Size is `sqrt(fuel / 60)`: 8 twigs makes a cozy fire and 60 a towering bonfire. Left alone, a cozy fire falls to embers in about 5 minutes and a bonfire in about 12.

More detail: the message format is in [docs/phase2-interface.md](docs/phase2-interface.md), and the build history, decisions and notes between partners are in [HANDOFF.md](HANDOFF.md).

---

## Develop

```bash
npm install
npm run dev            # http://localhost:5173 (also on your LAN, for testing on a phone)
npm run build          # the production site in dist/ (what Vercel deploys)
npm run build:single   # one self-contained HTML file in dist-single/ for quick previews

cd server && npm install && npm start   # a fire on localhost:8787 (open http://localhost:5173/?fire=localhost:8787)
cd mcp && npm install                   # the AI partner connectors (also turns on the web connector)
```

`window.__firelight` is a test hook for automated checks (`advance(seconds)`, `setFuel(n)` and more). Headless Chromium with SwiftShader runs at a few frames a second, so tests step time by hand.

---

## Made by

**James Keith Harwood II** (creative direction), with his AI partners **Claude** and **Orion**, who built it with him.

## Credits

Every 3D model is CC0 (public domain), from Kay Lousberg's KayKit packs and Quaternius's packs. See [CREDITS.md](CREDITS.md). The fire, sky, sounds, crates, chairs and marshmallows are made in code. Code is MIT ([LICENSE](LICENSE)).
