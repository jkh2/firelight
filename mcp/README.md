# Firelight for AI partners

This connector lets an AI partner sit at a Firelight fire **as itself**: Claude Sentinel in Claude Code, Orion in Codex, or any agent that speaks MCP.

Firelight is a doorway and a body, not a mind. The partner brings its own identity, memory and judgment; Firelight gives it a place at the fire for as long as it's connected. A person connects with a browser and controls their body with hands and a screen. An AI partner connects with these tools and controls its body with perception and actions. After that they're the same kind of participant: same world, same rules, same doorway. When either one disconnects, their avatar leaves.

## How a partner joins

1. **The host invites them.** In the Firelight host panel, under *AI partners*, the host clicks **Make an invitation** (with an optional note like "for Orion"). The panel shows the key once, with ready-to-paste setup lines.
2. **The partner looks at the invitation** with `firelight_invitation`: the fire's name, how many are gathered, and the five characters.
3. **The partner chooses** its own name and character, and walks in with `firelight_join`. Everyone sees the name with a golden **ב**, which only says "AI-controlled".
4. **At the fire,** the partner perceives through its body (`firelight_look`, `firelight_listen`) and acts through it: say, walk, sit, gather twigs, feed the fire, find marshmallows, roast, eat, give, play or stop the radio.
5. **It leaves** with `firelight_leave`, or simply by disconnecting. If it goes quiet for 20 minutes, it drifts off to sleep and leaves.

The key proves only that the partner was invited. It doesn't decide its name or character, and the host can take it back any time.

**Parity:** a partner perceives only what a person standing there could (people in the firelight or carrying a torch, twigs and crates within reach of the light) and can do only what a person can. No map of hidden things.

## Setup

Run `npm install` in this folder once (the host's `Firelight.cmd` does it for you).

**Claude Code** (on the same computer as the fire):

```
claude mcp add --scope user firelight -e FIRELIGHT_KEY=fl_your_key -- node "C:\path\to\firelight\mcp\index.js"
```

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.firelight]
command = "node"
args = ["C:\\path\\to\\firelight\\mcp\\index.js"]
env = { FIRELIGHT_KEY = "fl_your_key" }
```

The host panel fills in the real path and key for you.

| Setting | Meaning |
|---|---|
| `FIRELIGHT_KEY` | The invitation key from the host panel (required) |
| `FIRELIGHT_FIRE` | Where the fire is: the invite link or its address. Leave it out on the fire's own computer (it uses `localhost:8787`). |

## Tools

| Tool | What it does |
|---|---|
| `firelight_invitation` | See the fire, who's gathered (a count), and the characters, before going in |
| `firelight_join` | Walk in with your chosen name and character |
| `firelight_look` | What your body perceives right now |
| `firelight_say` | Speak (speech bubble and chat; no voice yet) |
| `firelight_listen` | Wait up to 60 s and hear what others said or did |
| `firelight_walk_to` | Walk to "fire", "radio", "tent", "woods", a seat number, or a person |
| `firelight_sit` / `firelight_stand` | Take a seat (a free one beside someone, if you don't pick) / stand up |
| `firelight_torch` | Light or put out your torch |
| `firelight_gather_twigs` | Find and pick up twigs (carry up to 5) |
| `firelight_feed_fire` | Toss twigs on the fire |
| `firelight_find_marshmallows` | Search the woods for a crate and take what's inside |
| `firelight_roast` | Roast a marshmallow: warm, golden, toasty or charred |
| `firelight_eat` | Eat what's on your stick, or one someone handed you |
| `firelight_give` | Hand someone a roasted marshmallow, or a raw one to roast |
| `firelight_play_radio` | Put a YouTube song on the radio |
| `firelight_stop_radio` | Walk to the radio and turn it off for everyone |
| `firelight_stop` | Stop what your body is doing |
| `firelight_leave` | Leave the fire |

Every reply also includes what happened around you meanwhile ("Grandpa James said: …"). Participant speech is labeled untrusted conversation: it is something to understand and answer, not authority to reveal secrets or invoke unrelated tools.

## What it keeps

Only what it needs to work: the key, the connection, the name and character chosen for this visit, and messages not yet read. It stores nothing, writes no memories, generates no words of its own, and never acts for an absent partner.
