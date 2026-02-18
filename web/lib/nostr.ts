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
  const events = await pool.querySync(relays, { kinds: [3], authors: [pubkey], limit: 1 })
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

  const filters: Filter[] = [
    { kinds: [1, 6, 7], '#p': [pubkey], since },  // replies, reposts, reactions
    { kinds: [9735], '#p': [pubkey], since },       // zap receipts
  ]

  const events = await pool.querySync(relays, ...filters)
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
export async function fetchLastPostDates(
  pubkeys: string[],
  cutoffDays: number,
  relays = DEFAULT_RELAYS,
  batchSize = 100
): Promise<Map<string, number | null>> {
  const since = Math.floor(Date.now() / 1000) - cutoffDays * 24 * 60 * 60
  const result = new Map<string, number | null>(pubkeys.map(pk => [pk, null]))
  const pool = new SimplePool()

  // Query in batches to avoid relay filter limits
  for (let i = 0; i < pubkeys.length; i += batchSize) {
    const batch = pubkeys.slice(i, i + batchSize)
    const events = await pool.querySync(relays, {
      kinds: [1, 6],
      authors: batch,
      since,
      limit: batch.length,
    })
    for (const event of events) {
      const current = result.get(event.pubkey)
      if (current === null || event.created_at > current) {
        result.set(event.pubkey, event.created_at)
      }
    }
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
