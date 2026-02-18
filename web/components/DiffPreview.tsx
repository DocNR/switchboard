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

type Step = 'unfollows' | 'follows'

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
  const removes = evalled.filter(e => e.result === 'REMOVE')
  const adds    = evalled.filter(e => e.result === 'ADD')
  const tooNew  = evalled.filter(e => e.result === 'TOO_NEW')

  const hasRemoves = removes.length > 0
  const hasAdds    = adds.length > 0

  const [step, setStep] = useState<Step>(hasRemoves ? 'unfollows' : 'follows')
  const [confirming, setConfirming] = useState(false)

  const confirmedInactive = removes.filter(e => e.engagement?.lastPostAt !== null)
  const notFoundOnRelays  = removes.filter(e => e.engagement?.lastPostAt === null)

  const willUnfollow = removes.filter(e => !keepOverrides.has(e.pubkey))
  const willFollow   = adds.filter(e => !skipOverrides.has(e.pubkey))
  const noChanges    = willUnfollow.length === 0 && willFollow.length === 0

  const totalSteps   = (hasRemoves ? 1 : 0) + (hasAdds ? 1 : 0)

  // Bulk helpers — unfollows (global)
  function unfollowAll() { removes.forEach(e => { if  (keepOverrides.has(e.pubkey)) onKeepToggle(e.pubkey) }) }
  function keepAll()     { removes.forEach(e => { if (!keepOverrides.has(e.pubkey)) onKeepToggle(e.pubkey) }) }
  // Bulk helpers — unfollows (per sub-group)
  function unfollowAllConfirmed() { confirmedInactive.forEach(e => { if  (keepOverrides.has(e.pubkey)) onKeepToggle(e.pubkey) }) }
  function keepAllConfirmed()     { confirmedInactive.forEach(e => { if (!keepOverrides.has(e.pubkey)) onKeepToggle(e.pubkey) }) }
  function unfollowAllNotFound()  { notFoundOnRelays.forEach(e =>  { if  (keepOverrides.has(e.pubkey)) onKeepToggle(e.pubkey) }) }
  function keepAllNotFound()      { notFoundOnRelays.forEach(e =>  { if (!keepOverrides.has(e.pubkey)) onKeepToggle(e.pubkey) }) }

  // Bulk helpers — follows
  function followAll() { adds.forEach(e => { if  (skipOverrides.has(e.pubkey)) onSkipToggle(e.pubkey) }) }
  function skipAll()   { adds.forEach(e => { if (!skipOverrides.has(e.pubkey)) onSkipToggle(e.pubkey) }) }

  function handleNext() {
    if (step === 'unfollows' && hasAdds) { setStep('follows'); return }
    setConfirming(true)
  }

  function handleBack() {
    if (step === 'follows' && hasRemoves) { setStep('unfollows'); return }
    onBack()
  }

  const isLastStep = step === 'follows' || !hasAdds

  // ── nothing to show ──
  if (!hasRemoves && !hasAdds && tooNew.length === 0) {
    return (
      <div className="space-y-6">
        <p className="text-zinc-600 text-sm text-center py-6">No changes recommended.</p>
        <button onClick={onBack} className="w-full py-3 rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900">
          ← Back
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Confirmation modal ── */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="text-base font-bold">Confirm & publish</h2>
            <div className="space-y-2 text-sm">
              {willUnfollow.length > 0 && (
                <div>
                  <p>
                    <span className="font-semibold">Unfollow {willUnfollow.length}</span>
                    <span className="text-zinc-400"> account{willUnfollow.length !== 1 ? 's' : ''}</span>
                  </p>
                  {notFoundOnRelays.filter(e => !keepOverrides.has(e.pubkey)).length > 0 && (
                    <p className="text-zinc-500 text-xs mt-0.5">
                      ⚠ {notFoundOnRelays.filter(e => !keepOverrides.has(e.pubkey)).length} not found on queried relays
                    </p>
                  )}
                </div>
              )}
              {willFollow.length > 0 && (
                <p>
                  <span className="font-semibold">Follow {willFollow.length}</span>
                  <span className="text-zinc-400"> new account{willFollow.length !== 1 ? 's' : ''}</span>
                </p>
              )}
              {noChanges && (
                <p className="text-zinc-500">No changes selected.</p>
              )}
            </div>
            {!noChanges && (
              <p className="text-zinc-600 text-xs">
                Publishes a new kind 3 event. Unfollows cannot be undone without re-adding manually.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 py-2.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirming(false); onApply() }}
                disabled={noChanges}
                className="flex-1 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
              >
                Sign & publish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step indicator (only when both steps exist) ── */}
      {totalSteps > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setStep('unfollows')}
            className={`flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 ${step === 'unfollows' ? 'text-zinc-200 font-semibold' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
            <span className={`w-4 h-4 rounded-full border text-center leading-none flex items-center justify-center text-[10px] font-bold ${step === 'unfollows' ? 'border-zinc-400 text-zinc-300' : 'border-zinc-700 text-zinc-600'}`}>1</span>
            Unfollows
          </button>
          <span className="text-zinc-700">——</span>
          <button
            onClick={() => hasRemoves && setStep('follows')}
            className={`flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 ${step === 'follows' ? 'text-zinc-200 font-semibold' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
            <span className={`w-4 h-4 rounded-full border text-center flex items-center justify-center text-[10px] font-bold ${step === 'follows' ? 'border-zinc-400 text-zinc-300' : 'border-zinc-700 text-zinc-600'}`}>2</span>
            New follows
          </button>
        </div>
      )}

      {/* ══ STEP 1: UNFOLLOWS ══ */}
      {step === 'unfollows' && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-200">
                Review unfollows
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  {willUnfollow.length} of {removes.length} selected
                </span>
              </h2>
              <div className="flex gap-3 text-xs">
                <button onClick={unfollowAll} className="text-zinc-500 hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900">All</button>
                <span className="text-zinc-700">·</span>
                <button onClick={keepAll} className="text-zinc-500 hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900">None</button>
              </div>
            </div>
            <p className="text-zinc-500 text-xs mt-0.5">
              Checked accounts will be unfollowed. Uncheck any you want to keep.
            </p>
          </div>

          {/* Confirmed inactive sub-group */}
          {confirmedInactive.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-zinc-600 text-xs">Confirmed inactive</p>
                <div className="flex gap-3 text-xs">
                  <button onClick={unfollowAllConfirmed} className="text-zinc-600 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900">All</button>
                  <span className="text-zinc-700">·</span>
                  <button onClick={keepAllConfirmed} className="text-zinc-600 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900">None</button>
                </div>
              </div>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {confirmedInactive.map(({ pubkey, engagement }) => (
                  <PersonRow
                    key={pubkey}
                    pubkey={pubkey}
                    profile={profiles.get(pubkey)}
                    detail={removeReason(engagement)}
                    checked={!keepOverrides.has(pubkey)}
                    onToggle={() => onKeepToggle(pubkey)}
                    accent="red"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Not found sub-group */}
          {notFoundOnRelays.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-zinc-500 text-xs">⚠ Not found on queried relays</p>
                <div className="flex gap-3 text-xs">
                  <button onClick={unfollowAllNotFound} className="text-zinc-600 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900">All</button>
                  <span className="text-zinc-700">·</span>
                  <button onClick={keepAllNotFound} className="text-zinc-600 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900">None</button>
                </div>
              </div>
              <p className="text-zinc-600 text-xs -mt-0.5">
                Higher false-positive risk — may post to relays not in your list. Review carefully.
              </p>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {notFoundOnRelays.map(({ pubkey }) => (
                  <PersonRow
                    key={pubkey}
                    pubkey={pubkey}
                    profile={profiles.get(pubkey)}
                    detail="no posts found on queried relays"
                    checked={!keepOverrides.has(pubkey)}
                    onToggle={() => onKeepToggle(pubkey)}
                    accent="amber"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ STEP 2: FOLLOWS ══ */}
      {step === 'follows' && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-200">
                Review new follows
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  {willFollow.length} of {adds.length} selected
                </span>
              </h2>
              <div className="flex gap-3 text-xs">
                <button onClick={followAll} className="text-zinc-500 hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900">All</button>
                <span className="text-zinc-700">·</span>
                <button onClick={skipAll} className="text-zinc-500 hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900">None</button>
              </div>
            </div>
            <p className="text-zinc-500 text-xs mt-0.5">
              Checked accounts will be followed. Uncheck any you want to skip.
            </p>
          </div>

          <div className="space-y-1 max-h-72 overflow-y-auto">
            {adds.map(({ pubkey, engagement }) => (
              <PersonRow
                key={pubkey}
                pubkey={pubkey}
                profile={profiles.get(pubkey)}
                detail={formatEngagement(engagement)}
                checked={!skipOverrides.has(pubkey)}
                onToggle={() => onSkipToggle(pubkey)}
                accent="green"
              />
            ))}
          </div>

          {tooNew.length > 0 && (
            <p className="text-zinc-700 text-xs">
              {tooNew.length} engager{tooNew.length !== 1 ? 's' : ''} not shown — account too new to auto-follow.
            </p>
          )}
        </div>
      )}

      {publishError && (
        <p className="text-zinc-400 text-sm text-center">{publishError}</p>
      )}

      {/* ── Navigation ── */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={handleBack}
          disabled={publishing}
          className="py-3 px-4 rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-sm font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
        >
          ← Back
        </button>
        <button
          onClick={handleNext}
          disabled={publishing}
          className="flex-1 py-3 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
        >
          {publishing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Signing…
            </span>
          ) : !isLastStep ? (
            `Next — review ${willFollow.length} new follow${willFollow.length !== 1 ? 's' : ''} →`
          ) : noChanges ? (
            'No changes selected'
          ) : (
            <>
              Apply —{' '}
              {willUnfollow.length > 0 && `unfollow ${willUnfollow.length}`}
              {willUnfollow.length > 0 && willFollow.length > 0 && ' · '}
              {willFollow.length > 0 && `follow ${willFollow.length}`}
              {' '}→
            </>
          )}
        </button>
      </div>

    </div>
  )
}

// ─── PersonRow ────────────────────────────────────────────────────────────────
// Entire row is a <label> so clicking anywhere toggles the checkbox.
// Links inside use stopPropagation so they don't accidentally toggle.

function PersonRow({
  pubkey,
  profile,
  detail,
  checked,
  onToggle,
  accent,
}: {
  pubkey: string
  profile?: Profile
  detail?: string
  checked: boolean
  onToggle: () => void
  accent: 'red' | 'amber' | 'green'
}) {
  const npub = nip19.npubEncode(pubkey)
  const name = displayName(pubkey, profile)

  const accentClass =
    accent === 'red'   ? 'accent-red-500' :
    accent === 'amber' ? 'accent-amber-500' :
    'accent-green-500'

  return (
    <label className={`flex items-center gap-3 p-2.5 rounded-lg border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-all ${!checked ? 'opacity-40' : ''}`}>

      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className={`w-4 h-4 flex-shrink-0 rounded ${accentClass}`}
      />

      {/* Avatar */}
      <a href={`nostr:${npub}`} onClick={e => e.stopPropagation()} className="flex-shrink-0" title="Open in Nostr app">
        {profile?.picture ? (
          <img
            src={profile.picture}
            alt={name}
            className="w-7 h-7 rounded-full bg-zinc-800 object-cover hover:ring-2 hover:ring-purple-500 transition-all"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-zinc-800 hover:ring-2 hover:ring-purple-500 transition-all flex-shrink-0" />
        )}
      </a>

      {/* Name + detail */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <a
            href={`nostr:${npub}`}
            onClick={e => e.stopPropagation()}
            className="text-sm text-zinc-300 truncate hover:text-white transition-colors"
            title="Open in Nostr app"
          >
            {name}
          </a>
          <a
            href={`https://primal.net/p/${npub}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-zinc-700 hover:text-zinc-400 transition-colors flex-shrink-0 text-xs"
            title="Open on Primal"
          >
            ↗
          </a>
        </div>
        {detail && <p className="text-xs mt-0.5 text-zinc-500">{detail}</p>}
      </div>
    </label>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────

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
