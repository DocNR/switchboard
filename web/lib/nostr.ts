// Nostr relay querying utilities for switchboard
// Uses nostr-tools: https://github.com/nbd-wtf/nostr-tools
//
// All functions return data from a pool of public relays.
// Relay coverage is imperfect — see PRD.md for the known limitation.

import { SimplePool, nip19 } from 'nostr-tools'
import type { Filter, Event } from 'nostr-tools'
import type { EngagementData, Follow, Profile } from './types'

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://offchain.pub',
  'wss://relay.snort.social',
  'wss://relay.primal.net',
  'wss://nostr.wine',
]

// Convert npub1... or hex pubkey to hex
export function toHexPubkey(input: string): string {
  if (input.startsWith('npub1')) {
    const decoded = nip19.decode(input)
    if (decoded.type !== 'npub') throw new Error('Invalid npub')
    return decoded.data
  }
  if (/^[0-9a-f]{64}$/i.test(input)) return input.toLowerCase()
  throw new Error(`Unrecognized pubkey format: ${input}`)
}

// Fetch the user's follow list (kind 3). Returns the most recent event found.
export async function fetchFollowList(
  pubkey: string,
  relays = DEFAULT_RELAYS
): Promise<{ follows: Follow[]; rawEvent: Event | null }> {
  const pool = new SimplePool()
  const events = await pool.querySync(relays, { kinds: [3], authors: [pubkey], limit: 5 })
  pool.close(relays)

  if (!events.length) return { follows: [], rawEvent: null }

  // Sort descending by created_at in case multiple relays returned results
  const latest = events.sort((a, b) => b.created_at - a.created_at)[0]

  const follows: Follow[] = latest.tags
    .filter(t => t[0] === 'p' && t[1]?.length === 64)
    .map(t => ({
      pubkey: t[1],
      relayHint: t[2] || undefined,
      petname: t[3] || undefined,
    }))

  return { follows, rawEvent: latest }
}

// Fetch profiles (kind 0) for a list of pubkeys. Returns a map of pubkey → Profile.
export async function fetchProfiles(
  pubkeys: string[],
  relays = DEFAULT_RELAYS
): Promise<Map<string, Profile>> {
  if (!pubkeys.length) return new Map()
  const pool = new SimplePool()
  const events = await pool.querySync(relays, { kinds: [0], authors: pubkeys })
  pool.close(relays)

  const profiles = new Map<string, Profile>()

  for (const event of events) {
    if (profiles.has(event.pubkey)) {
      // Keep most recent
      const existing = profiles.get(event.pubkey)!
      if (event.created_at <= (existing.createdAt ?? 0)) continue
    }
    try {
      const meta = JSON.parse(event.content)
      profiles.set(event.pubkey, {
        pubkey: event.pubkey,
        name: meta.name,
        displayName: meta.display_name,
        picture: meta.picture,
        nip05: meta.nip05,
        about: meta.about,
        createdAt: event.created_at,
      })
    } catch {
      // Malformed kind 0 content — skip
    }
  }

  return profiles
}

// Fetch all engagement events directed at `pubkey` within the last `windowDays` days.
// Returns a map of sender pubkey → EngagementData.
export async function fetchEngagementData(
  pubkey: string,
  windowDays: number,
  relays = DEFAULT_RELAYS
): Promise<Map<string, EngagementData>> {
  const since = Math.floor(Date.now() / 1000) - windowDays * 24 * 60 * 60
  const pool = new SimplePool()

  // querySync takes one filter at a time in nostr-tools 2.x — run both in parallel
  const [engagementEvents, zapEvents] = await Promise.all([
    pool.querySync(relays, { kinds: [1, 6, 7], '#p': [pubkey], since }),
    pool.querySync(relays, { kinds: [9735], '#p': [pubkey], since }),
  ])
  const events = [...engagementEvents, ...zapEvents]
  pool.close(relays)

  const data = new Map<string, EngagementData>()

  const get = (pk: string): EngagementData => {
    if (!data.has(pk)) {
      data.set(pk, {
        pubkey: pk,
        replyCount: 0,
        repostCount: 0,
        quoteCount: 0,
        reactionCount: 0,
        zapsSats: 0,
        lastPostAt: null,
        accountCreatedAt: null,
      })
    }
    return data.get(pk)!
  }

  for (const event of events) {
    const sender = event.pubkey
    if (sender === pubkey) continue  // skip self

    const d = get(sender)

    switch (event.kind) {
      case 1:
        // Check if it's a quote (has #q tag) vs a plain reply
        if (event.tags.some(t => t[0] === 'q')) {
          d.quoteCount++
        } else {
          d.replyCount++
        }
        break
      case 6:
        d.repostCount++
        break
      case 7:
        d.reactionCount++
        break
      case 9735:
        d.zapsSats += extractZapSats(event)
        break
    }
  }

  return data
}

// Extract sats from a kind 9735 zap receipt event
function extractZapSats(zapReceipt: Event): number {
  try {
    const descTag = zapReceipt.tags.find(t => t[0] === 'description')
    if (!descTag) return 0
    const zapRequest = JSON.parse(descTag[1])
    const amountTag = zapRequest.tags?.find((t: string[]) => t[0] === 'amount')
    if (!amountTag) return 0
    return Math.floor(parseInt(amountTag[1]) / 1000)  // millisats → sats
  } catch {
    return 0
  }
}

// Fetch the most recent post (kind 1 or 6) for each pubkey in a list.
// Returns a map of pubkey → unix timestamp of last post (null if none found).
//
// Queries each author individually rather than batching multiple authors per
// filter. Batching causes prolific users to crowd out quieter ones: relays
// return the N most-recent events across ALL authors combined, so heavy posters
// can consume all available slots and quiet authors appear unfindable.
//
// Each relay is queried separately with a per-relay timeout. Relays that fail
// repeatedly are dropped for the remainder of the run so one bad relay can't
// stall the entire analysis.
export async function fetchLastPostDates(
  pubkeys: string[],
  cutoffDays: number,
  relays = DEFAULT_RELAYS,
): Promise<Map<string, number | null>> {
  const since = Math.floor(Date.now() / 1000) - cutoffDays * 24 * 60 * 60
  const result = new Map<string, number | null>(pubkeys.map(pk => [pk, null]))
  const pool = new SimplePool()

  const CONCURRENCY = 30     // authors queried in parallel per round
  const TIMEOUT_MS   = 3000  // per-relay timeout per query
  const MAX_FAILURES = 5     // drop a relay after this many timeouts/errors

  // Track cumulative failures per relay across all rounds
  const failures = new Map<string, number>(relays.map(r => [r, 0]))

  for (let i = 0; i < pubkeys.length; i += CONCURRENCY) {
    const batch = pubkeys.slice(i, i + CONCURRENCY)

    // Recompute active relays at the start of each round
    const active = relays.filter(r => (failures.get(r) ?? 0) < MAX_FAILURES)
    if (active.length === 0) break  // all relays failed — give up

    await Promise.all(batch.map(async pk => {
      // Query each relay independently so we can timeout and track failures per relay
      const perRelay = await Promise.all(active.map(async relay => {
        try {
          return await Promise.race([
            pool.querySync([relay], { kinds: [1, 6], authors: [pk], since, limit: 5 }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
            ),
          ])
        } catch {
          failures.set(relay, (failures.get(relay) ?? 0) + 1)
          return [] as Event[]
        }
      }))

      const all = perRelay.flat()
      if (all.length > 0) {
        const latest = all.reduce((a, b) => a.created_at > b.created_at ? a : b)
        result.set(pk, latest.created_at)
      }
    }))
  }

  pool.close(relays)
  return result
}

// Estimate account age by fetching the earliest known event for a pubkey
export async function fetchAccountAge(
  pubkey: string,
  relays = DEFAULT_RELAYS
): Promise<number | null> {
  const pool = new SimplePool()
  // kind 0 is usually the oldest event; fallback to kind 1
  const events = await pool.querySync(relays, {
    kinds: [0, 1],
    authors: [pubkey],
    limit: 1,
    // Note: some relays support 'until' to get oldest events
  })
  pool.close(relays)
  if (!events.length) return null
  return events.sort((a, b) => a.created_at - b.created_at)[0].created_at
}

// Fetch recent kind 1 notes by a pubkey, sorted newest first
export async function fetchRecentNotes(
  pubkey: string,
  limit = 20,
  relays = DEFAULT_RELAYS
): Promise<Event[]> {
  const pool = new SimplePool()
  const events = await pool.querySync(relays, {
    kinds: [1],
    authors: [pubkey],
    limit,
  })
  pool.close(relays)
  return events.sort((a, b) => b.created_at - a.created_at)
}

// Fetch the user's switchboard allowlist from a NIP-51 kind 30000 follow set.
// Returns the pubkeys stored in the list, or [] if none found.
export async function fetchAllowlist(
  pubkey: string,
  relays = DEFAULT_RELAYS
): Promise<string[]> {
  const pool = new SimplePool()
  const events = await pool.querySync(relays, {
    kinds: [30000],
    authors: [pubkey],
    '#d': ['switchboard-allowlist'],
    limit: 5, // paranoia: grab a few in case of relay inconsistency
  })
  pool.close(relays)
  if (!events.length) return []
  const latest = events.sort((a, b) => b.created_at - a.created_at)[0]
  return latest.tags
    .filter(t => t[0] === 'p' && t[1]?.length === 64)
    .map(t => t[1])
}

// Build an unsigned kind 30000 event (NIP-51 follow set) for the switchboard allowlist
export function buildAllowlistEvent(
  pubkey: string,
  allowlist: string[]
): Omit<Event, 'id' | 'sig'> {
  return {
    kind: 30000,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', 'switchboard-allowlist'],
      ['title', 'switchboard protected follows'],
      ...allowlist.map(pk => ['p', pk]),
    ],
    content: '',
  }
}

// Build and return a pruned kind 3 event (unsigned) from an existing event
// replacingPubkeys: pubkeys to remove from the follow list
// addingPubkeys: pubkeys to add (with no relay hint or petname by default)
export function buildNewFollowListEvent(
  originalEvent: Event,
  removePubkeys: Set<string>,
  addPubkeys: string[]
): Omit<Event, 'id' | 'sig'> {
  const existingTags = originalEvent.tags.filter(
    t => !(t[0] === 'p' && removePubkeys.has(t[1]))
  )
  const newTags = addPubkeys
    .filter(pk => !existingTags.some(t => t[0] === 'p' && t[1] === pk))
    .map(pk => ['p', pk])

  return {
    kind: 3,
    pubkey: originalEvent.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [...existingTags, ...newTags],
    content: originalEvent.content,
  }
}
