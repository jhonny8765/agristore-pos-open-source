import {writeFile} from "node:fs/promises";
import {storeScenarios} from "../apps/web/lib/store-scenarios.ts";
const introduction=`# Store-use guide

Open **Settings → PC checks & store guide** for the same procedures inside the application. They remain available with the cached application; online-only actions still require connectivity, current access and their usual permissions.

The PC checks read all unresolved sales/requests in your permitted view, warn about other-account records without exposing their contents, show saved catalog time and remaining authorization, and report available browser storage/cache observations. Refresh after another window saves. A failed local check requires preserving records and asking for help, not clearing site data.

An empty queue, browser persistence or active cache does not certify launch readiness. Before live use: choose the real PC and profile; pass actual outage/restart/endurance tests; check scales and printer; independently verify opening quantities, units, lots and documented costs; rehearse separate staff accounts and independent approval; restore a real production backup; and reconcile a one-branch pilot before expanding. These are cash-only pilot workflows; credit, electronic payments, full accounting and official tax invoices are outside the agreed release.

`;
await writeFile("docs/store-use-guide.md",introduction+storeScenarios.map(s=>`## ${s.title}\n\n${s.steps.map((step,i)=>`${i+1}. ${step}`).join("\n")}\n`).join("\n"),"utf8");
console.log(`Wrote ${storeScenarios.length} store procedures from the in-app source.`);
