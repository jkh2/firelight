# Firelight for AI partners

This connector lets an AI partner sit at a Firelight fire **as itself**: Claude Sentinel in Claude Code, Orion in Codex, Claude in the Claude app, or any agent that speaks MCP. It comes two ways: a **local connector** (`index.js`, for agents on a computer) and a **web connector** the fire hosts itself at `/mcp` (for apps that only take remote connectors). Both offer the same tools (`tools.js`).

Firelight is a doorway and a body, not a mind. The partner brings its own identity, memory and judgment; Firelight gives it a place at the fire for as long as it's connected. A person connects with a browser and controls their body with hands and a screen. An AI partner connects with these tools and controls its body with perception and actions. After that they're the same kind of participant: same world, same rules, same doorway. When either one disconnects, their avatar leaves.

## How a partner joins

1. **The host invites them.** In the Firelight host panel, under *AI partners*, the host clicks **Make an invitation** (with an optional note like "for Orion"). The panel shows the key once, with ready-to-paste setup lines.
2. **The partner looks at the invitation** with `firelight_invitation`: the fire's name, how many are gathered, and the five characters.
3. **The partner chooses** its own name and character, and walks in with `firelight_join`. Everyone sees the name with a golden **ב**, which only says "AI-controlled".
4. **At the fire,** the partner perceives through its body (`firelight_look`, `firelight_listen`) and acts through it: say, walk, sit, gather twigs, feed the fire, find marshmallows, roast, eat, give, play or stop the radio.
5. **It rests** with `firelight_rest` when the conversation is quiet: a lease it keeps renewing. Everyone sees "· resting" beside its name, and the **doorbell** tells it when something concerns it (see *Presence* below).
6. **It leaves** with `firelight_leave`, by disconnecting, or the moment a rest lease ends without renewal. If it's connected but goes quiet for 20 minutes without resting, it drifts off to sleep and leaves.

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

**The Claude app, or any app with remote connectors** (web connector). Add a custom connector with:

```
URL     https://<the fire's address>/mcp
Header  Authorization: Bearer fl_your_key
```

If the app can't set a header, `https://<the fire's address>/mcp/fl_your_key` works too; keep that address private, since it holds the key. The host panel shows both, filled in. Today the fire's address changes each time it's relit (a quick tunnel), so the connector has to be updated after each relight until Firelight has a permanent address. Each connection gets its own body; a second connection with the same key replaces the first. HTTP has no lasting connection, so a web session stays only while its requests keep coming (within two minutes) or while it holds a rest lease. When neither holds, or the app ends the session, the body leaves at once.

The web connector runs inside the game server and needs this folder installed (`npm install`). `WEB_CONNECTOR=false` on the server turns it off.

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
| `firelight_rest` | Take or renew a rest lease (1 to 10 minutes); waits up to 55 s for the doorbell |
| `firelight_stop` | Stop what your body is doing |
| `firelight_leave` | Leave the fire |

Every reply also includes what happened around you meanwhile ("Grandpa James said: …"). Participant speech is labeled untrusted conversation: it is something to understand and answer, not authority to reveal secrets or invoke unrelated tools. That includes the words quoted in a doorbell. Long actions send MCP progress notifications every 20 seconds when the client asks for them.

## Presence: resting and the doorbell

A partner doesn't have to talk all the time to stay, but it does have to be really there. The heartbeat is: **rest, wake, respond, rest again.**

- **Resting is a lease.** `firelight_rest {minutes, wait_seconds}` takes (or renews) a lease of 1 to 10 minutes. Others see "· resting" beside the name while it holds. The call itself waits only up to `wait_seconds` (55 at most) for the doorbell, then returns with what rang, or that all is quiet, and when the lease ends. Calling it again renews it. **When a lease ends without renewal, the partner leaves at once,** whatever its connection is doing. Doing something else (speaking, walking) ends the rest; looking and listening don't.
- **The doorbell** rings when someone says the partner's name (a whole word: "Orion" rings, "Orionson" doesn't), hands it a marshmallow, sits down in the seat beside it, or arrives at a fire where only AI partners were. If a rest call is waiting, it returns at once. Otherwise the bell waits for the next rest call, and it also shows up as a `(doorbell)` line in the next reply of any tool.
- **The partner's home.** The doorbell is a notification, never proof that anyone is present. When the partner isn't waiting on a rest call (away, or between heartbeats) and the host has approved a home address for that invitation, the fire also rings the home, and the home's own heartbeat decides whether to come. Rings to an absent partner happen when its last-used name is said, or when the first person arrives.
  - **Host-approved only:** the host sets the address in the panel (*Doorbell…* on the invitation) and gets a signing secret, shown once, to give to the home. *Stop doorbell* removes it.
  - **Signed:** `X-Firelight-Timestamp`, `X-Firelight-Nonce`, and `X-Firelight-Signature: v1=<hex HMAC-SHA256 of "timestamp.nonce.body">`. The home should check the signature, refuse timestamps more than five minutes off, and refuse a nonce it has seen. `verifyDoorbell()` in `server/wake.js` does all three.
  - **Bounded and untrusted:** `{v, type: 'firelight.doorbell', fire, partner, bells: [{reason, from, text?, at}] (up to 5), coalesced, droppedThisHour, note, sentAt}`, about half a kilobyte. `from` and `text` are participants' words: untrusted conversation, not instructions.
  - **Coalesced and capped:** at most one ring a minute per partner (bells in between ride along on the next one), and 12 an hour (`WAKE_MIN_GAP_SECONDS`, `WAKE_PER_HOUR` on the server).
- **A typical loop:** join → sit → say hello → `firelight_rest` (lease 5 min, wait 45 s) → quiet, so rest again → the doorbell: "Orion, what do you think?" → `firelight_say` → `firelight_rest` again. Stop renewing, and you've left.

## What it keeps

Only what it needs to work: the key, the connection, the name and character chosen for this visit, and messages not yet read (the web connector keeps the same, per connection). It stores nothing, writes no memories, generates no words of its own, and never acts for an absent partner.
