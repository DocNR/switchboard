// Core TypeScript types for switchboard
// See PRD.md for full data architecture documentation

export interface Follow {
  pubkey: string       // hex pubkey
  relayHint?: string   // relay URL hint from kind 3 tag
  petname?: string     // local petname from kind 3 tag
}

export interface Profile {
  pubkey: string
  name?: string
  displayName?: string
  picture?: string
  nip05?: string
  about?: string
  createdAt?: number   // kind 0 event timestamp
}

// Aggregated engagement stats for a single pubkey (relative to the logged-in user)
export interface EngagementData {
  pubkey: string
  replyCount: number         // kind 1 replies to you
  repostCount: number        // kind 6 reposts of your notes
  quoteCount: number         // kind 1 with #q tag on your notes
  reactionCount: number      // kind 7 reactions to your notes
  zapsSats: number           // total sats zapped to you (from kind 9735)
  lastPostAt: number | null  // unix timestamp of their most recent kind 1/6
  accountCreatedAt: number | null  // earliest known event timestamp (account age proxy)
}

// A single ADD rule — if a pubkey meets this threshold, add them to follows
export interface AddRule {
  enabled: boolean
  signal: 'replies' | 'reposts' | 'quotes' | 'reactions' | 'zaps_sats'
  threshold: number
}

// A single REMOVE rule — if a current follow meets this, remove them
export interface RemoveRule {
  enabled: boolean
  signal: 'inactive_days' | 'no_profile' | 'never_engaged_me'
  threshold: number
}

// The full rules configuration
export interface Rules {
  windowDays: number        // lookback window for engagement signals (ADD rules)
  minAccountAgeDays: number // minimum account age in days before auto-adding
  add: AddRule[]
  remove: RemoveRule[]
  allowlist: string[]       // hex pubkeys that are ALWAYS kept, no matter what
}

// Result of evaluating a pubkey against the current rules
export type EvalResult = 'ADD' | 'REMOVE' | 'KEEP' | 'TOO_NEW' | 'PROTECTED'

export interface EvalledPubkey {
  pubkey: string
  result: EvalResult
  profile?: Profile
  engagement?: EngagementData
  isCurrentFollow: boolean
}

// Default rules — safe starting point
export const DEFAULT_RULES: Rules = {
  windowDays: 30,
  minAccountAgeDays: 60,
  add: [
    { enabled: true,  signal: 'replies',   threshold: 10 },
    { enabled: true,  signal: 'zaps_sats', threshold: 1000 },
    { enabled: false, signal: 'reposts',   threshold: 5 },
    { enabled: false, signal: 'quotes',    threshold: 5 },
    { enabled: false, signal: 'reactions', threshold: 20 },
  ],
  remove: [
    { enabled: true,  signal: 'inactive_days',    threshold: 180 },
    { enabled: false, signal: 'no_profile',        threshold: 0 },
    { enabled: false, signal: 'never_engaged_me',  threshold: 0 },
  ],
  allowlist: [],
}
