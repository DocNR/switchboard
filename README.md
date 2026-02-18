# switchboard

Rules-based Nostr follow list manager. Prune dormant follows and auto-follow people who actually engage with your content.

> **Current state:** Working CLI script (`scripts/prune.sh`) + Next.js web app scaffold. Web app is the main thing being built. Contributors welcome — read [CLAUDE.md](CLAUDE.md) to get started.

---

## What it does

Nostr follow lists rot. People go dormant, you accumulate follows you never interact with, and your feed fills with noise. switchboard fixes this two ways:

**Prune** — remove follows who haven't posted in N months

**Add** — automatically follow people who reply to, repost, or zap you above a threshold you define

**Protect** — allowlist specific npubs that are never auto-removed

Example rules:
- *Remove anyone who hasn't posted in 6 months*
- *Add anyone who replied to me 10+ times in the last 30 days*
- *Add anyone who zapped me 1000+ sats in the last 30 days*
- *Never remove these 3 specific accounts*
- *Only add accounts older than 60 days (anti-spam)*

---

## Project structure

```
switchboard/
├── scripts/
│   └── prune.sh     # Working CLI script (bash + nak). Use this now.
├── web/             # Next.js web app (main thing being built)
│   ├── app/         # Next.js App Router pages
│   ├── lib/         # Nostr queries, rules engine, TypeScript types
│   └── ...
├── PRD.md           # Full product spec — read before building
├── CLAUDE.md        # Guide for contributors using Claude Code
└── README.md        # This file
```

---

## Quick start — CLI (works today)

### Requirements

- [`nak`](https://github.com/fiatjaf/nak) — the nostr army knife
- [`jq`](https://jqlang.github.io/jq/)
- bash 3.2+ (ships with macOS)

```bash
# Install nak
go install github.com/fiatjaf/nak@latest

# Dry run first — safe, doesn't publish anything
NOSTR_SECRET_KEY=nsec1... bash scripts/prune.sh --dry-run --months 6

# Prune for real
NOSTR_SECRET_KEY=nsec1... bash scripts/prune.sh --months 6
```

**Keep your nsec out of shell history:**
```bash
read -rs NOSTR_SECRET_KEY && export NOSTR_SECRET_KEY
bash scripts/prune.sh --months 6
```

### CLI options

| Flag | Default | Description |
|---|---|---|
| `--months N` | 6 | Remove follows with no activity in last N months |
| `--kinds K,K` | 1,6 | Event kinds that count as "active" |
| `--concurrency N` | 30 | Parallel relay queries |
| `--dry-run` | false | Print results without publishing |
| `--output FILE` | — | Save pruned event JSON to file, don't publish |

---

## Web app — local development

### Requirements

- Node.js 20+ (`node --version` to check — see note below)
- npm

```bash
cd web
npm install
npm run dev
# → http://localhost:3000
```

> **Node.js version:** Next.js 16 requires Node 20+. If you have an older version, install Node 20 via [nvm](https://github.com/nvm-sh/nvm): `nvm install 20 && nvm use 20`

### You'll need a NIP-07 browser extension to test login

- [Alby](https://getalby.com/) — most popular, also has a lightning wallet
- [nos2x](https://github.com/fiatjaf/nos2x) — minimal, by fiatjaf
- Or use a NIP-46 bunker — the login widget handles it automatically

---

## Contributing

Read [CLAUDE.md](CLAUDE.md) — it has the full context, good first issues, and guidance for working with Claude Code (especially if you're new to it).

1. Fork the repo
2. Open an issue to discuss what you want to build
3. Submit a PR against `main`

No contribution is too small.

---

## Tech stack (web app)

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Nostr | [nostr-tools](https://github.com/nbd-wtf/nostr-tools) |
| Login | [window.nostr.js](https://github.com/fiatjaf/window.nostr.js) |
| Hosting | Vercel |

---

## License

MIT
