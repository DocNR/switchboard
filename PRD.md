# switchboard — Product Requirements Document

## Vision

A rules-based Nostr follow list manager. Instead of manually curating who you follow, you define engagement criteria and switchboard enforces them: remove people who've gone quiet, add people who actually engage with your content, and protect the follows you always want to keep.

**Core insight:** your follow list determines your feed. Treating it as a programmable filter — rather than a static list you accumulate forever — makes it genuinely useful.

---

## Problem

Nostr follow lists rot. People go dormant, interests shift, and there's no tooling to match. Existing tools (Plebs vs. Zombies, NostrFlu) only prune inactive follows based on a fixed time threshold. Nobody has built the other half: **auto-following people who engage with you**, or given users a flexible rules engine to define what "worth following" means to them.

---

## User Stories

- "Remove everyone who hasn't posted in 6 months"
- "Add everyone who replied to me more than 10 times in the last 30 days"
- "Add everyone who zapped me more than 1000 sats in the last 30 days"
- "Never remove these specific accounts, no matter what"
- "Only add accounts that are at least 60 days old — no fresh spam accounts"
- "Show me who I follow that I've never interacted with, so I can decide"
- "Preview the changes before they go live"

---

## Engagement Signals Available on Nostr

| Signal | Nostr Kind | Query Method | Notes |
|---|---|---|---|
| **Replies** | 1 | `#p` tag = your pubkey | Someone replied to one of your notes |
| **Reposts** | 6 | `#p` tag = your pubkey | Someone reposted one of your notes |
| **Quote posts** | 1 | `#q` tag = one of your event IDs | Someone quoted your note |
| **Reactions** | 7 | `#p` tag = your pubkey | Likes, emoji reactions |
| **Zaps received** | 9735 | `#p` tag = your pubkey | Zap receipts; amount extracted from `description` tag JSON |
| **Your own activity** | 1, 6 | author = your pubkey | For pruning: last post date |

**Zap amount extraction:** kind 9735 has a `description` tag containing the JSON-encoded zap request (kind 9734). The zap request contains an `amount` tag in millisats. Divide by 1000 for sats. No bolt11 parsing required.

**Account age:** determined by the `created_at` timestamp of the earliest known event from that pubkey (typically their kind 0 profile). This is a lower bound — the account may be older than what relays have cached.

**Important caveat:** all signals only reflect what's visible on queried relays. Someone who only posts to private/obscure relays will appear silent. The UI should surface this limitation.

---

## Rules Engine

Rules come in two types: **ADD** rules and **REMOVE** rules. Plus a protected **allowlist**.

### Rule Structure

```
{action} anyone who {signal} {operator} {threshold} in the last {window} days
```

Examples:
- `ADD` anyone who `replied to me` `≥` `10` times in the last `30` days
- `ADD` anyone who `zapped me` `≥` `1000` sats in the last `30` days
- `ADD` anyone who `reposted or quoted me` `≥` `5` times in the last `30` days
- `REMOVE` anyone who `hasn't posted` in the last `180` days
- `REMOVE` anyone I follow who `has never replied to me or reacted to me`

### Parameters

All thresholds and time windows are user-configurable. Defaults are suggestions, not constraints.

| Parameter | Description | Default | Applies To |
|---|---|---|---|
| **Lookback window** | How far back to look for engagement | 30 days | All ADD rules |
| **Min replies/reposts/quotes** | Minimum count to qualify for ADD | 10 | ADD rules |
| **Min sats zapped** | Minimum total sats to qualify for ADD | 1000 sats | ADD zap rule |
| **Inactivity threshold** | Days since last post to qualify for REMOVE | 180 days | REMOVE rules |
| **Min account age** | Account must be older than N days to be added | 60 days | All ADD rules |

### Allowlist

A set of npubs that are **always kept**, regardless of any REMOVE rule. Never auto-removed. Manually curated.

Users can add specific npubs (paste hex or npub1...) to the allowlist. Useful for:
- People you follow for personal reasons regardless of posting frequency
- Accounts you want to keep even if they're temporarily inactive
- Your own alternate accounts

### Rule Combining

- Multiple ADD rules are **OR'd**: meet any one → get added
- Multiple REMOVE rules are **AND'd** by default, with toggle for OR
- **Allowlist always takes precedence** — protected npubs are never removed
- ADD takes precedence over REMOVE: if someone qualifies to be added, they won't be removed even if they also match a remove rule
- **Account age gate applies to all ADD rules** — even if engagement thresholds are met, accounts younger than `minAccountAgeDays` are never auto-added

---

## UX Flow

### 1. Landing / Login

```
┌─────────────────────────────────────────────┐
│                                             │
│           switchboard                       │
│                                             │
│   Rules-based Nostr follow management.      │
│                                             │
│   ┌─────────────────────────────────────┐  │
│   │  Login with Nostr                   │  │
│   └─────────────────────────────────────┘  │
│                                             │
│   Works with Alby, nos2x, or any NIP-07    │
│   extension. No keys leave your browser.   │
│                                             │
└─────────────────────────────────────────────┘
```

Uses `window.nostr.js` — a single script tag from fiatjaf that handles both NIP-07 browser extensions and NIP-46 remote signers. No key handling in app code.

### 2. Loading State

After login, fetch in parallel:
- Your kind 3 (follow list)
- Your recent notes (last N days) — to find engagers
- Recent events tagged with your pubkey (replies, reposts, quotes, reactions, zaps)

Show progress indicator. ~15–60 seconds for large accounts.

### 3. Rules Builder

```
┌─────────────────────────────────────────────────────────┐
│  switchboard          npub1xy5...urc  [Disconnect]      │
├─────────────────────────────────────────────────────────┤
│  Currently following: 1,266                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Lookback window: [30] days  (used for all ADD rules)   │
│                                                         │
│  ADD rules  (follow your engagers)                      │
│  ─────────────────────────────────────────────────────  │
│  ☑  Replied to me        ≥ [10]  times                  │
│  ☑  Zapped me            ≥ [1000] sats                  │
│  ☑  Reposted/quoted me   ≥ [5]   times                  │
│  ☐  Reacted to me        ≥ [20]  times                  │
│                                                         │
│  Min account age: [60] days  (applies to all ADD rules) │
│                                                         │
│  REMOVE rules  (prune inactive follows)                 │
│  ─────────────────────────────────────────────────────  │
│  ☑  Hasn't posted in     [180] days                     │
│  ☐  Never engaged with any of my posts                  │
│  ☐  No profile (kind 0) set up                          │
│                                                         │
│  Protected follows (allowlist)                          │
│  ─────────────────────────────────────────────────────  │
│  ☐  Enable allowlist                                    │
│  [ paste npub or hex to protect ]  [ Add ]              │
│  npub1abc...  [remove]                                  │
│                                                         │
│  ┌──────────────────────────────┐                       │
│  │  Preview Changes             │                       │
│  └──────────────────────────────┘                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4. Preview / Diff

```
┌─────────────────────────────────────────────────────────┐
│  Preview Changes                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ✂  Removing 743  (inactive > 180 days)                 │
│  ＋  Adding 12    (engaged with you in last 30 days)    │
│  🔒  Protected 3  (allowlisted — never removed)         │
│  ━━  Keeping 523                                        │
│                                                         │
│  New follow count: 535                                  │
│                                                         │
│  Removing:                                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ○ alice   last post: 8 months ago       [keep]   │  │
│  │ ○ bob     no profile                   [keep]   │  │
│  │ ○ carol   last post: 2 years ago       [keep]   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  Adding:                                                │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ○ dave    12 replies, 5000 sats · 90d old [skip] │  │
│  │ ○ eve     18 replies · 120d old          [skip]  │  │
│  │ ✗ frank   11 replies · 14d old  (too new)        │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ⚠ Some removals may be false positives — accounts     │
│    that only post to relays not queried here.           │
│                                                         │
│  ┌──────────────────────┐  ┌────────────────────────┐  │
│  │  ← Back to Rules     │  │  Apply Changes  →      │  │
│  └──────────────────────┘  └────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Accounts rejected by the age gate are shown but marked "too new" and excluded from the ADD batch.

### 5. Confirmation & Publish

Signs and publishes the new kind 3 via NIP-07 extension. No key ever touches the app. Shows relay publish status per relay.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Vercel deployment, easy collab |
| Language | TypeScript | Better Claude Code assistance |
| Styling | Tailwind CSS | Utility-first, no separate CSS |
| Nostr library | nostr-tools | JS/TS, by fiatjaf, browser-native |
| Login | window.nostr.js | NIP-07 + NIP-46, by fiatjaf |
| Hosting | Vercel | Git push → deployed |

All client-side — no backend, no database, no server. Static export compatible.

---

## Data Architecture

### On Load

```
1. GET kind 3 (follow list)
2. GET your recent events (to find who engaged with you)
3. GET events tagged with your pubkey:
   - kind 1/6/7 with #p = your pubkey  (replies, reposts, reactions)
   - kind 1 with #q = your event IDs   (quotes)
   - kind 9735 with #p = your pubkey   (zap receipts)
4. Aggregate by sender pubkey → EngagementData
5. For ADD candidates: check account age via earliest known event
6. GET kind 0 profiles for display (batch fetch)
```

### Key Types

```typescript
interface EngagementData {
  pubkey: string
  replyCount: number
  repostCount: number
  quoteCount: number
  reactionCount: number
  zapsSats: number
  lastPostAt: number | null        // unix timestamp
  accountCreatedAt: number | null  // earliest known event timestamp
}

interface Rules {
  windowDays: number               // lookback window for ADD rules
  minAccountAgeDays: number        // age gate for ADD rules
  add: AddRule[]
  remove: RemoveRule[]
  allowlist: string[]              // hex pubkeys always protected
}

interface AddRule {
  signal: 'replies' | 'reposts' | 'quotes' | 'reactions' | 'zaps_sats'
  threshold: number
}

interface RemoveRule {
  signal: 'inactive_days' | 'no_profile' | 'never_engaged_me'
  threshold: number
}
```

### Zap Amount Extraction

```typescript
const descriptionTag = event.tags.find(t => t[0] === 'description')
const zapRequest = JSON.parse(descriptionTag[1])
const amountTag = zapRequest.tags.find(t => t[0] === 'amount')
const sats = parseInt(amountTag[1]) / 1000
```

### Account Age Check

```typescript
// Fetch the oldest available event for a pubkey
// created_at of earliest event = lower bound on account age
const ageMs = Date.now() - (accountCreatedAt * 1000)
const ageDays = ageMs / (1000 * 60 * 60 * 24)
const isOldEnough = ageDays >= rules.minAccountAgeDays
```

### Rules Evaluation

```typescript
function evaluate(pubkey, data, rules, isCurrentFollow) {
  // Allowlist always wins
  if (rules.allowlist.includes(pubkey)) return 'KEEP'

  // Check ADD rules (for non-follows who engaged)
  const accountOldEnough = (data.accountCreatedAt)
    ? daysSince(data.accountCreatedAt) >= rules.minAccountAgeDays
    : false

  const qualifiesForAdd = accountOldEnough &&
    rules.add.some(rule => meetsAddRule(data, rule, rules.windowDays))

  if (qualifiesForAdd && !isCurrentFollow) return 'ADD'

  // Check REMOVE rules (for existing follows)
  if (isCurrentFollow) {
    const qualifiesForRemove = rules.remove.every(rule => meetsRemoveRule(data, rule))
    if (qualifiesForRemove && !qualifiesForAdd) return 'REMOVE'
  }

  return 'KEEP'
}
```

---

## MVP Scope

### In MVP
- NIP-07/NIP-46 login via window.nostr.js
- Fetch follow list and engagement data from relays
- ADD rules: reply count, repost/quote count, zap sats (configurable threshold + shared window)
- REMOVE rules: inactivity threshold (configurable days)
- Account age gate on ADD rules
- Allowlist: add/remove specific npubs by hex or npub1...
- Preview diff with per-item [keep] / [skip] overrides
- Publish new kind 3 via NIP-07 (no key in app)
- Relay coverage warning

### Post-MVP
- Scheduled / recurring runs
- "Never add" blocklist (complement to allowlist)
- Mutual follow filter
- Engagement score (weighted combo → single sortable number)
- Export/import rule sets as JSON or Nostr event
- NIP-65 outbox model for better relay coverage
- History log of changes

---

## Existing Tools (context)

| Feature | switchboard | Plebs vs Zombies | NostrFlu |
|---|---|---|---|
| Auto-add engagers | ✅ | ❌ | ❌ |
| Configurable rules | ✅ | ❌ | ❌ |
| Zap-based criteria | ✅ | ❌ | ❌ |
| Account age gate | ✅ | ❌ | ❌ |
| Allowlist | ✅ | ❌ | ❌ |
| Per-item overrides | ✅ | ❌ | ❌ |
| NIP-07 + NIP-46 login | ✅ | ❌ | partial |
| Preview before publish | ✅ | partial | ✅ |

---

## Open Questions

1. **Relay coverage:** implement NIP-65 outbox model in MVP to reduce false-positive dormant flags?
2. **Rate limiting:** 2000+ relay queries in browser — need request batching strategy
3. **Rules persistence:** localStorage (simple) or publish as a Nostr event (portable across devices)?
