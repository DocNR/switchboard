// Rules engine for switchboard
// Evaluates pubkeys against user-defined ADD/REMOVE rules
// See PRD.md § Rules Engine for full spec

import type { AddRule, EngagementData, EvalResult, EvalledPubkey, RemoveRule, Rules } from './types'

function daysSince(timestamp: number): number {
  return (Date.now() / 1000 - timestamp) / (60 * 60 * 24)
}

function meetsAddRule(data: EngagementData, rule: AddRule): boolean {
  if (!rule.enabled) return false
  switch (rule.signal) {
    case 'replies':    return data.replyCount >= rule.threshold
    case 'reposts':    return data.repostCount >= rule.threshold
    case 'quotes':     return data.quoteCount >= rule.threshold
    case 'reactions':  return data.reactionCount >= rule.threshold
    case 'zaps_sats':  return data.zapsSats >= rule.threshold
  }
}

function meetsRemoveRule(data: EngagementData, rule: RemoveRule): boolean {
  if (!rule.enabled) return false
  switch (rule.signal) {
    case 'inactive_days':
      // Remove if no post found within threshold days
      if (data.lastPostAt === null) return true
      return daysSince(data.lastPostAt) > rule.threshold
    case 'no_profile':
      return data.accountCreatedAt === null
    case 'never_engaged_me':
      return (
        data.replyCount === 0 &&
        data.repostCount === 0 &&
        data.quoteCount === 0 &&
        data.reactionCount === 0 &&
        data.zapsSats === 0
      )
  }
}

// Evaluate a single pubkey against the full rules set
export function evaluate(
  pubkey: string,
  data: EngagementData,
  rules: Rules,
  isCurrentFollow: boolean
): EvalResult {
  // Allowlist always wins — protected follows are never removed
  if (rules.allowlist.includes(pubkey)) return 'PROTECTED'

  // Account age gate — applies to all ADD rules
  const accountOldEnough =
    data.accountCreatedAt !== null &&
    daysSince(data.accountCreatedAt) >= rules.minAccountAgeDays

  const qualifiesForAdd =
    rules.add.some(rule => meetsAddRule(data, rule))

  // Person meets engagement criteria but account is too new
  if (qualifiesForAdd && !accountOldEnough && !isCurrentFollow) return 'TOO_NEW'

  // Person meets engagement criteria and account is old enough → add
  if (qualifiesForAdd && accountOldEnough && !isCurrentFollow) return 'ADD'

  // Existing follow: check if they should be removed
  if (isCurrentFollow) {
    const qualifiesForRemove = rules.remove
      .filter(r => r.enabled)
      .every(rule => meetsRemoveRule(data, rule))

    // Don't remove if they also qualify to be added (engagement overrides inactivity)
    if (qualifiesForRemove && !qualifiesForAdd) return 'REMOVE'
  }

  return 'KEEP'
}

// Run evaluation across all known pubkeys
// currentFollows: set of currently followed pubkeys
// engagementData: map of pubkey → EngagementData (from fetchEngagementData)
export function evaluateAll(
  currentFollows: Set<string>,
  engagementData: Map<string, EngagementData>,
  rules: Rules
): EvalledPubkey[] {
  const results: EvalledPubkey[] = []
  const seen = new Set<string>()

  // Evaluate all current follows
  for (const pubkey of currentFollows) {
    seen.add(pubkey)
    const data = engagementData.get(pubkey) ?? emptyEngagement(pubkey)
    results.push({
      pubkey,
      result: evaluate(pubkey, data, rules, true),
      engagement: data,
      isCurrentFollow: true,
    })
  }

  // Evaluate engagers who aren't currently followed (ADD candidates)
  for (const [pubkey, data] of engagementData) {
    if (seen.has(pubkey)) continue
    results.push({
      pubkey,
      result: evaluate(pubkey, data, rules, false),
      engagement: data,
      isCurrentFollow: false,
    })
  }

  return results
}

// Summary counts from an evaluation pass
export function summarize(evalled: EvalledPubkey[]) {
  return {
    total: evalled.filter(e => e.isCurrentFollow).length,
    adding: evalled.filter(e => e.result === 'ADD').length,
    removing: evalled.filter(e => e.result === 'REMOVE').length,
    keeping: evalled.filter(e => e.result === 'KEEP').length,
    protected: evalled.filter(e => e.result === 'PROTECTED').length,
    tooNew: evalled.filter(e => e.result === 'TOO_NEW').length,
  }
}

function emptyEngagement(pubkey: string): EngagementData {
  return {
    pubkey,
    replyCount: 0,
    repostCount: 0,
    quoteCount: 0,
    reactionCount: 0,
    zapsSats: 0,
    lastPostAt: null,
    accountCreatedAt: null,
  }
}
