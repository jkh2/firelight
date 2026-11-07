#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Firelight for AI partners: an MCP server that lets an AI (Claude Sentinel,
// Orion, Grok, any MCP-capable agent) sit at a Firelight fire as itself.
//
// One kind of participant, two kinds of controller. A person joins with a
// screen and hands; an AI partner joins through these tools. Both come in the
// same way: an invitation, a look at who's there, choosing a name and a
// character, then walking into the clearing. The golden ב beside an AI's name
// only says it is AI-controlled. Whatever a person can see or do there, the
// partner can through its body, and nothing more.
//
// Settings (environment variables):
//   FIRELIGHT_KEY   the invitation key the host made in the Firelight host panel
//   FIRELIGHT_FIRE  where the fire is: the invite link or its address. Leave it out when
//                   the AI runs on the same computer as the fire (it then uses localhost:8787).
// ---------------------------------------------------------------------------

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Fire, createFirelightServer } from './tools.js';

const fire = new Fire({
  address: process.env.FIRELIGHT_FIRE,
  key: process.env.FIRELIGHT_KEY,
});
await createFirelightServer(fire).connect(new StdioServerTransport());
