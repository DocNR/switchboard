# CLAUDE.md — switchboard contributor guide

This file is read automatically by Claude Code when you open this project. It gives Claude (and you) the full context: what's been built, what needs building, how things fit together, and how to work effectively with Claude Code.

**If you're new to Claude Code:** open a terminal in this folder, run `claude`, and describe what you want to build or fix in plain English. Claude will read this file automatically and know the context.

---

## What this project is

**switchboard** is a rules-based Nostr follow list manager with two parts:

1. **`scripts/prune.sh`** — a working bash CLI that prunes dormant follows using `nak`. Done and functional.
2. **`web/`** — a Next.js web app where users define engagement rules (prune inactive + auto-follow engagers). This is the main thing to build.

The full product spec is in [PRD.md](PRD.md). Read it before building anything significant — it covers the rules engine, UX flow, data architecture, and all the design decisions.

---

## Current state of the web app

What exists:
- `web/lib/types.ts` — all TypeScript types and the DEFAULT_RULES constant
- `web/lib/nostr.ts` — relay query functions (follow list, engagement data, profiles, etc.)
- `web/lib/rules.ts` — the full rules evaluation engine
- `web/app/layout.tsx` — root layout with window.nostr.js loaded
- `web/app/page.tsx` — login page (functional)
- `web/app/dashboard/page.tsx` — dashboard shell (fetches follow count, rest is placeholder)

What doesn't exist yet (needs to be built):
- Rules builder UI component
- Engagement data fetching wired into the dashboard
- Diff/preview component
- Publish flow (signing + sending to relays)
- Allowlist management UI

---

## Project structure

```
switchboard/
├── scripts/
│   └── prune.sh              # Working CLI — don't break this
├── web/                      # Next.js app
│   ├── app/
│   │   ├── layout.tsx        # Root layout — window.nostr.js is loaded here
│   │   ├── page.tsx          # Login page
│   │   ├── globals.css       # Global styles
│   │   └── dashboard/
│   │       └── page.tsx      # Main app (needs work)
│   ├── lib/
│   │   ├── types.ts          # TypeScript types + DEFAULT_RULES
│   │   ├── nostr.ts          # All relay queries live here
│   │   └── rules.ts          # Rules engine — evaluate(), evaluateAll(), summarize()
│   ├── package.json
│   └── tsconfig.json
├── PRD.md                    # Full product spec
├── CLAUDE.md                 # This file
└── README.md
```

---

## Tech decisions — don't change without discussion

- **Login:** `window.nostr.js` (loaded in `layout.tsx`). Handles NIP-07 extensions + NIP-46 bunkers. No key handling in app code, ever.
- **Nostr library:** `nostr-tools` — JavaScript, browser-native, no WASM
- **Framework:** Next.js App Router with `'use client'` on everything (it's a 100% client-side app)
- **Language:** TypeScript throughout
- **Styling:** Tailwind CSS — no separate CSS files for components
- **No backend** — all data comes from Nostr relays directly from the browser

---

## Nostr concepts you need to know

| Concept | Description |
|---|---|
| **kind 3** | Follow list event. Publishing a new one replaces the old one. Has `p` tags for each followed pubkey. |
| **kind 1** | Text note (post) |
| **kind 6** | Repost |
| **kind 7** | Reaction (like/emoji) |
| **kind 9735** | Zap receipt. Contains amount in millisats in the `description` tag's JSON. |
| **NIP-07** | Browser extension API (`window.nostr`). Signs events without exposing private key. |
| **NIP-46** | Remote signer protocol. `window.nostr.js` handles both NIP-07 and NIP-46. |
| **npub** | Bech32-encoded public key (npub1...). Convert to/from hex with `nip19` from nostr-tools. |

Ask Claude anything: *"how do zap receipts work?"*, *"explain NIP-65"*, *"how do I query for replies to a pubkey?"*

---

## Good first issues

Roughly ordered by difficulty. Each is self-contained.

### Starter (great for first contribution)

**1. Wire engagement data into the dashboard**
- In `web/app/dashboard/page.tsx`, call `fetchEngagementData(pubkey, rules.windowDays)` from `@/lib/nostr`
- Display a count of how many people engaged with the user in the last 30 days
- Store the result in state for use by the rules builder

**2. Build the RulesBuilder component**
- Create `web/components/RulesBuilder.tsx`
- Render checkboxes + number inputs for each rule in `DEFAULT_RULES`
- Props: `rules: Rules`, `onChange: (rules: Rules) => void`
- Reference the wireframe in PRD.md § Rules Builder

**3. Allowlist input**
- Create `web/components/AllowlistInput.tsx`
- Text input that accepts npub1... or hex pubkeys
- On add: convert to hex with `toHexPubkey()` from `@/lib/nostr` and append to `rules.allowlist`
- Show current allowlist entries with a remove button each

### Intermediate

**4. Run rules evaluation and show summary**
- After fetching follows + engagement data, call `evaluateAll()` from `@/lib/rules`
- Call `summarize()` to get counts
- Display: "Removing X · Adding Y · Keeping Z · Protected N"

**5. Build the DiffPreview component**
- Create `web/components/DiffPreview.tsx`
- Show list of REMOVE candidates (with profile pic, name, last post date)
- Show list of ADD candidates (with engagement stats, account age)
- Each row has a [keep] / [skip] button that flips the decision
- Show TOO_NEW accounts as greyed out with a "too new" label

**6. Fetch and display profiles**
- Call `fetchProfiles(pubkeys)` from `@/lib/nostr` for the accounts shown in the diff
- Display avatar, name, nip05 in each row

### Harder

**7. Publish flow**
- Build the "Apply Changes" button
- Call `buildNewFollowListEvent()` from `@/lib/nostr` to construct the unsigned event
- Sign with `await window.nostr.signEvent(event)`
- Publish to relays using `SimplePool` from nostr-tools
- Show success/failure per relay

**8. Account age fetching**
- For each ADD candidate, call `fetchAccountAge(pubkey)` from `@/lib/nostr`
- Store `accountCreatedAt` in their `EngagementData`
- The rules engine already handles this — it just needs the data

**9. Progress indicator during data loading**
- Loading 2000+ follows takes 15–60 seconds
- Add a progress bar or step-by-step status: "Fetching follows... Fetching engagement data... Running rules..."

---

## How to work with Claude Code effectively

**Be specific about scope.** Instead of "build the dashboard", say "build the RulesBuilder component as described in CLAUDE.md issue #2, using the Rules type from lib/types.ts." Claude works better with clear scope.

**Reference existing code.** Say "following the pattern in lib/nostr.ts" or "use the EvalledPubkey type from lib/types.ts." Claude will read those files and be consistent.

**Reference the PRD.** For anything UX-related, say "implement the diff preview as described in PRD.md § Preview / Diff." Claude will follow the spec.

**One issue at a time.** Pick one good first issue, describe it clearly, let Claude implement it, then review before moving on.

**Always dry-run CLI changes.** If touching `scripts/prune.sh`, test with `--dry-run` before publishing to relays.

**Read the code Claude writes.** Claude will show you what it's doing. Ask if anything is unclear. It's your codebase.

---

## Running the web app locally

```bash
# Requires Node.js 20+
# Check: node --version
# Install 20 if needed: nvm install 20 && nvm use 20

cd web
npm install
npm run dev
# → http://localhost:3000
```

You'll need a NIP-07 browser extension (Alby, nos2x) or the login widget will guide you through NIP-46.

## Running the CLI script

```bash
# Dry run (safe)
NOSTR_SECRET_KEY=nsec1... bash scripts/prune.sh --dry-run --months 6

# Prune
NOSTR_SECRET_KEY=nsec1... bash scripts/prune.sh --months 6 --concurrency 50
```

---

## Known issues / gotchas

**Node.js version:** Next.js 16 requires Node 20+. The scaffold was created on Node 18 — the warnings are harmless for now but upgrade before deploying.

**window.nostr type:** TypeScript doesn't know about `window.nostr` by default. You may need to add a type declaration. Ask Claude: *"add a TypeScript type declaration for window.nostr"*

**Relay coverage:** `fetchEngagementData` and `fetchLastPostDates` only query a fixed set of relays. Someone who posts exclusively to obscure relays may be incorrectly flagged. This is a known limitation — always show the relay coverage warning in the UI.

**Batching:** `fetchLastPostDates` batches pubkeys in groups of 100 to avoid relay filter limits. If you add new bulk queries, follow the same pattern.
