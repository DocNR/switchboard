'use client'

import { useState } from 'react'
import { nip19 } from 'nostr-tools'
import type { EvalledPubkey, Profile, EngagementData } from '@/lib/types'

interface DiffPreviewProps {
  evalled: EvalledPubkey[]
  profiles: Map<string, Profile>
  keepOverrides: Set<string>
  skipOverrides: Set<string>
  onKeepToggle: (pubkey: string) => void
  onSkipToggle: (pubkey: string) => void
  onBack: () => void
  onApply: () => void
  publishing: boolean
  publishError: string | null
}

export default function DiffPreview({
  evalled,
  profiles,
  keepOverrides,
  skipOverrides,
  onKeepToggle,
  onSkipToggle,
  onBack,
  onApply,
  publishing,
  publishError,
}: DiffPreviewProps) {
  const [confirming, setConfirming] = useState(false)

  const removes = evalled.filter(e => e.result === 'REMOVE')
  const adds = evalled.filter(e => e.result === 'ADD')
  const tooNew = evalled.filter(e => e.result === 'TOO_NEW')

  // Split removes into two risk categories
  const confirmedInactive = removes.filter(e => e.engagement?.lastPostAt !== null)
  const notFoundOnRelays = removes.filter(e => e.engagement?.lastPostAt === null)

  const finalRemoveCount = removes.filter(e => !keepOverrides.has(e.pubkey)).length
  const finalAddCount = adds.filter(e => !skipOverrides.has(e.pubkey)).length
  const noChanges = finalRemoveCount === 0 && finalAddCount === 0

  function handleApplyClick() {
    if (noChanges) return
    setConfirming(true)
  }

  function handleConfirm() {
    setConfirming(false)
    onApply()
  }

  return (
    <div className="space-y-6">

      {/* Confirmation dialog */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="text-lg font-bold">Apply changes?</h2>
            <p className="text-zinc-400 text-sm">This will publish a new follow list:</p>
            <div className="space-y-1">
              {finalRemoveCount > 0 && (
                <p className="text-sm">
                  <span className="text-red-400 font-medium">−{finalRemoveCount}</span>
                  <span className="text-zinc-400"> unfollows</span>
                  {notFoundOnRelays.filter(e => !keepOverrides.has(e.pubkey)).length > 0 && (
                    <span className="text-amber-500 text-xs ml-2">
                      (includes {notFoundOnRelays.filter(e => !keepOverrides.has(e.pubkey)).length} not found on relays)
                    </span>
                  )}
                </p>
              )}
              {finalAddCount > 0 && (
                <p className="text-sm">
                  <span className="text-green-400 font-medium">+{finalAddCount}</span>
                  <span className="text-zinc-400"> new follows</span>
                </p>
              )}
            </div>
            <p className="text-zinc-600 text-xs">
              This publishes a new kind 3 event and cannot be undone without re-adding accounts manually.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 py-2.5 px-4 rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-2.5 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium transition-colors"
              >
                Confirm & Sign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-2xl font-bold text-red-400 tabular-nums">{finalRemoveCount}</div>
          <div className="text-zinc-500 text-xs mt-0.5">Removing</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-400 tabular-nums">{finalAddCount}</div>
          <div className="text-zinc-500 text-xs mt-0.5">Adding</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-zinc-400 tabular-nums">
            {evalled.filter(e => e.result === 'KEEP' || e.result === 'PROTECTED').length}
          </div>
          <div className="text-zinc-500 text-xs mt-0.5">Keeping</div>
        </div>
      </div>

      {/* Confirmed inactive removes */}
      {confirmedInactive.length > 0 && (
        <Section
          title={`Confirmed inactive (${confirmedInactive.length})`}
          note="Last post found but older than your threshold."
        >
          {confirmedInactive.map(({ pubkey, engagement }) => {
            const kept = keepOverrides.has(pubkey)
            return (
              <Row
                key={pubkey}
                name={displayName(pubkey, profiles.get(pubkey))}
                picture={profiles.get(pubkey)?.picture}
                subtitle={removeReason(engagement)}
                dimmed={kept}
                action={kept ? 'undo' : 'keep'}
                onAction={() => onKeepToggle(pubkey)}
              />
            )
          })}
        </Section>
      )}

      {/* Not found on relays — higher risk section */}
      {notFoundOnRelays.length > 0 && (
        <Section
          title={`Not found on queried relays (${notFoundOnRelays.length})`}
          note="⚠ Higher false positive risk — these accounts may post to other relays. Review carefully or use [keep]."
          noteClass="text-amber-500/80"
        >
          {notFoundOnRelays.map(({ pubkey }) => {
            const kept = keepOverrides.has(pubkey)
            return (
              <Row
                key={pubkey}
                name={displayName(pubkey, profiles.get(pubkey))}
                picture={profiles.get(pubkey)?.picture}
                subtitle="not found on queried relays"
                subtitleClass="text-amber-700"
                dimmed={kept}
                action={kept ? 'undo' : 'keep'}
                onAction={() => onKeepToggle(pubkey)}
              />
            )
          })}
          {notFoundOnRelays.filter(e => !keepOverrides.has(e.pubkey)).length > 0 && (
            <button
              onClick={() => notFoundOnRelays.forEach(e => {
                if (!keepOverrides.has(e.pubkey)) onKeepToggle(e.pubkey)
              })}
              className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors border border-dashed border-zinc-800 rounded-lg"
            >
              Keep all not-found ({notFoundOnRelays.filter(e => !keepOverrides.has(e.pubkey)).length})
            </button>
          )}
        </Section>
      )}

      {/* Adding */}
      {adds.length > 0 && (
        <Section title={`Adding (${adds.length})`}>
          {adds.map(({ pubkey, engagement }) => {
            const skipped = skipOverrides.has(pubkey)
            return (
              <Row
                key={pubkey}
                name={displayName(pubkey, profiles.get(pubkey))}
                picture={profiles.get(pubkey)?.picture}
                subtitle={formatEngagement(engagement)}
                dimmed={skipped}
                action={skipped ? 'undo' : 'skip'}
                onAction={() => onSkipToggle(pubkey)}
              />
            )
          })}
        </Section>
      )}

      {/* Too new */}
      {tooNew.length > 0 && (
        <Section title={`Too new to add (${tooNew.length})`}>
          {tooNew.map(({ pubkey, engagement }) => (
            <Row
              key={pubkey}
              name={displayName(pubkey, profiles.get(pubkey))}
              picture={profiles.get(pubkey)?.picture}
              subtitle={formatEngagement(engagement)}
              dimmed
              badge="account too new"
            />
          ))}
        </Section>
      )}

      {removes.length === 0 && adds.length === 0 && tooNew.length === 0 && (
        <p className="text-zinc-600 text-sm text-center py-4">No changes to show.</p>
      )}

      {publishError && (
        <p className="text-red-400 text-sm text-center">{publishError}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={publishing}
          className="flex-1 py-3 px-4 rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-sm font-medium transition-colors disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          onClick={handleApplyClick}
          disabled={publishing || noChanges}
          className="flex-1 py-3 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
        >
          {publishing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Signing…
            </span>
          ) : 'Apply Changes →'}
        </button>
      </div>

    </div>
  )
}

// ─── sub-components ───────────────────────────────────────────────────────

function Section({
  title,
  note,
  noteClass = 'text-zinc-600',
  children,
}: {
  title: string
  note?: string
  noteClass?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{title}</p>
      {note && <p className={`text-xs ${noteClass}`}>{note}</p>}
      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
        {children}
      </div>
    </div>
  )
}

function Row({
  name,
  picture,
  subtitle,
  subtitleClass = 'text-zinc-600',
  dimmed,
  action,
  onAction,
  badge,
}: {
  name: string
  picture?: string
  subtitle?: string
  subtitleClass?: string
  dimmed?: boolean
  action?: string
  onAction?: () => void
  badge?: string
}) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border border-zinc-800 transition-opacity ${dimmed ? 'opacity-40' : ''}`}>
      {picture ? (
        <img
          src={picture}
          alt={name}
          className="w-7 h-7 rounded-full flex-shrink-0 bg-zinc-800 object-cover"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      ) : (
        <div className="w-7 h-7 rounded-full flex-shrink-0 bg-zinc-800" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-300 truncate">{name}</p>
        {subtitle && <p className={`text-xs mt-0.5 ${subtitleClass}`}>{subtitle}</p>}
      </div>
      {badge && <span className="text-xs text-zinc-600 flex-shrink-0">{badge}</span>}
      {action && onAction && (
        <button
          onClick={onAction}
          className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0 ml-1"
        >
          {action}
        </button>
      )}
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────

function displayName(pubkey: string, profile?: Profile): string {
  if (profile?.displayName) return profile.displayName
  if (profile?.name) return profile.name
  const npub = nip19.npubEncode(pubkey)
  return `${npub.slice(0, 10)}…${npub.slice(-6)}`
}

function removeReason(data?: EngagementData): string {
  if (!data || data.lastPostAt === null) return 'not found on queried relays'
  const days = Math.floor((Date.now() / 1000 - data.lastPostAt) / (60 * 60 * 24))
  if (days < 30) return `last post: ${days}d ago`
  if (days < 365) return `last post: ${Math.floor(days / 30)}mo ago`
  return `last post: ${Math.floor(days / 365)}y ago`
}

function formatEngagement(data?: EngagementData): string {
  if (!data) return ''
  const parts: string[] = []
  if (data.replyCount > 0)    parts.push(`${data.replyCount} ${data.replyCount === 1 ? 'reply' : 'replies'}`)
  if (data.zapsSats > 0)      parts.push(`${data.zapsSats.toLocaleString()} sats`)
  if (data.repostCount > 0)   parts.push(`${data.repostCount} ${data.repostCount === 1 ? 'repost' : 'reposts'}`)
  if (data.quoteCount > 0)    parts.push(`${data.quoteCount} ${data.quoteCount === 1 ? 'quote' : 'quotes'}`)
  if (data.reactionCount > 0) parts.push(`${data.reactionCount} ${data.reactionCount === 1 ? 'reaction' : 'reactions'}`)
  return parts.join(' · ')
}
