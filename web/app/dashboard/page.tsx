'use client'

// Dashboard — profile + follow list management
//
// Flow:
//   profile → rules (idle) → rules (loading) → rules (ready) → preview → done
//
// All Nostr data comes from relays via nostr-tools SimplePool.
// Signing happens through window.nostr (NIP-07) — keys never touch this app.

import { useEffect, useState } from 'react'
import { SimplePool } from 'nostr-tools'
import { nip19 } from 'nostr-tools'
import type { Event } from 'nostr-tools'
import {
  fetchFollowList,
  fetchProfiles,
  fetchRecentNotes,
  fetchEngagementData,
  fetchLastPostDates,
  buildNewFollowListEvent,
  DEFAULT_RELAYS,
} from '@/lib/nostr'
import { evaluateAll, summarize } from '@/lib/rules'
import { DEFAULT_RULES } from '@/lib/types'
import type { Profile, Follow, EngagementData, Rules, EvalledPubkey } from '@/lib/types'
import RulesBuilder from '@/components/RulesBuilder'
import DiffPreview from '@/components/DiffPreview'

// ─── helpers ────────────────────────────────────────────────────────────────

function timeAgo(unix: number): string {
  const s = Math.floor(Date.now() / 1000) - unix
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  return mo < 12 ? `${mo}mo ago` : `${Math.floor(mo / 12)}y ago`
}

function truncate(text: string, max = 300): string {
  return text.length <= max ? text : text.slice(0, max).trimEnd() + '…'
}

// ─── component ──────────────────────────────────────────────────────────────

type View = 'profile' | 'rules' | 'preview'
type AnalysisPhase = 'idle' | 'loading' | 'ready'

export default function DashboardPage() {
  // ── auth ──
  const [pubkey, setPubkey] = useState('')

  // ── phase 1: profile ──
  const [profile, setProfile] = useState<Profile | null>(null)
  const [follows, setFollows] = useState<Follow[]>([])
  const [rawEvent, setRawEvent] = useState<Event | null>(null)
  const [notes, setNotes] = useState<Event[]>([])
  const [postsLast30d, setPostsLast30d] = useState<number | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)

  // ── phase 2: analysis ──
  const [view, setView] = useState<View>('profile')
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>('idle')
  const [loadStep, setLoadStep] = useState('')
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES)
  const [allData, setAllData] = useState<Map<string, EngagementData>>(new Map())
  const [evalled, setEvalled] = useState<EvalledPubkey[]>([])
  const [loadedWindowDays, setLoadedWindowDays] = useState<number | null>(null)

  // ── phase 3: preview ──
  const [previewProfiles, setPreviewProfiles] = useState<Map<string, Profile>>(new Map())
  const [previewLoading, setPreviewLoading] = useState(false)
  const [keepOverrides, setKeepOverrides] = useState<Set<string>>(new Set())
  const [skipOverrides, setSkipOverrides] = useState<Set<string>>(new Set())

  // ── phase 4: publish ──
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishDone, setPublishDone] = useState(false)
  const [newFollowCount, setNewFollowCount] = useState<number | null>(null)

  // ── init ──
  useEffect(() => {
    const stored = localStorage.getItem('nostr_pubkey')
    if (!stored) { window.location.href = '/'; return }
    setPubkey(stored)
    loadProfile(stored)
  }, [])

  // Re-evaluate whenever rules or loaded data changes
  useEffect(() => {
    if (analysisPhase !== 'ready') return
    const followSet = new Set(follows.map(f => f.pubkey))
    setEvalled(evaluateAll(followSet, allData, rules))
  }, [rules, allData, analysisPhase, follows])

  // ── data loaders ────────────────────────────────────────────────────────

  async function loadProfile(pk: string) {
    setProfileLoading(true)
    try {
      const [profileMap, { follows: fl, rawEvent: re }, recentNotes] = await Promise.all([
        fetchProfiles([pk]),
        fetchFollowList(pk),
        fetchRecentNotes(pk, 30),
      ])
      const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60
      setProfile(profileMap.get(pk) ?? null)
      setFollows(fl)
      setRawEvent(re)
      setNotes(recentNotes.slice(0, 10))
      setPostsLast30d(recentNotes.filter(n => n.created_at >= cutoff).length)
    } catch (err) {
      console.error('Profile load failed:', err)
    } finally {
      setProfileLoading(false)
    }
  }

  async function loadAnalysisData() {
    setAnalysisPhase('loading')
    try {
      // 1. Fetch engagement events (who engaged with the user in the window)
      setLoadStep('Fetching your engagement data…')
      const engagementMap = await fetchEngagementData(pubkey, rules.windowDays)

      // 2. Fetch last post dates for all current follows
      const followPubkeys = follows.map(f => f.pubkey)
      setLoadStep(`Checking ${followPubkeys.length.toLocaleString()} follows for recent activity…`)
      const lastPostDates = await fetchLastPostDates(followPubkeys, 400)

      // 3. Fetch profiles for non-follow engagers (account age proxy via profile.createdAt)
      const followSet = new Set(followPubkeys)
      const engagerPubkeys = [...engagementMap.keys()].filter(pk => !followSet.has(pk))
      if (engagerPubkeys.length > 0) {
        setLoadStep(`Checking ${engagerPubkeys.length} engager account ages…`)
        const engagerProfiles = await fetchProfiles(engagerPubkeys)
        for (const [pk, p] of engagerProfiles) {
          const data = engagementMap.get(pk)
          if (data && p.createdAt) data.accountCreatedAt = p.createdAt
        }
      }

      // 4. Merge: build a complete EngagementData map covering all follows + all engagers
      const merged = new Map<string, EngagementData>(engagementMap)

      for (const follow of follows) {
        const lastPost = lastPostDates.get(follow.pubkey) ?? null
        const existing = merged.get(follow.pubkey)
        if (existing) {
          existing.lastPostAt = lastPost
        } else {
          merged.set(follow.pubkey, {
            pubkey: follow.pubkey,
            replyCount: 0, repostCount: 0, quoteCount: 0,
            reactionCount: 0, zapsSats: 0,
            lastPostAt: lastPost,
            accountCreatedAt: null,
          })
        }
      }

      setAllData(merged)
      setLoadedWindowDays(rules.windowDays)
      setAnalysisPhase('ready')

      const evalled = evaluateAll(followSet, merged, rules)
      setEvalled(evalled)
    } catch (err) {
      console.error('Analysis failed:', err)
      setLoadStep('Failed to load data. Please try again.')
      setAnalysisPhase('idle')
    }
  }

  async function startPreview() {
    setPreviewLoading(true)
    try {
      // Only fetch profiles for the candidates we'll display
      const candidates = evalled
        .filter(e => e.result === 'ADD' || e.result === 'REMOVE' || e.result === 'TOO_NEW')
        .map(e => e.pubkey)
      const profileMap = await fetchProfiles(candidates)
      setPreviewProfiles(profileMap)
      setKeepOverrides(new Set())
      setSkipOverrides(new Set())
      setPublishError(null)
      setView('preview')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleApply() {
    if (!rawEvent) return
    setPublishing(true)
    setPublishError(null)
    try {
      const finalRemoves = new Set(
        evalled
          .filter(e => e.result === 'REMOVE' && !keepOverrides.has(e.pubkey))
          .map(e => e.pubkey)
      )
      const finalAdds = evalled
        .filter(e => e.result === 'ADD' && !skipOverrides.has(e.pubkey))
        .map(e => e.pubkey)

      const unsignedEvent = buildNewFollowListEvent(rawEvent, finalRemoves, finalAdds)

      if (!window.nostr) throw new Error('No Nostr signer found — is your extension active?')
      const signedEvent = await window.nostr.signEvent(unsignedEvent)

      const pool = new SimplePool()
      await Promise.allSettled(
        DEFAULT_RELAYS.map(relay => pool.publish([relay], signedEvent as unknown as Event))
      )
      pool.close(DEFAULT_RELAYS)

      const newCount = signedEvent.tags.filter((t: string[]) => t[0] === 'p').length
      setNewFollowCount(newCount)
      setPublishDone(true)

      // Update local state so profile shows new count
      setRawEvent(signedEvent as unknown as Event)
      setFollows(signedEvent.tags
        .filter((t: string[]) => t[0] === 'p')
        .map((t: string[]) => ({ pubkey: t[1], relayHint: t[2] || undefined, petname: t[3] || undefined }))
      )
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  function handleDisconnect() {
    localStorage.removeItem('nostr_pubkey')
    window.location.href = '/'
  }

  function toggleKeep(pk: string) {
    setKeepOverrides(prev => { const s = new Set(prev); s.has(pk) ? s.delete(pk) : s.add(pk); return s })
  }
  function toggleSkip(pk: string) {
    setSkipOverrides(prev => { const s = new Set(prev); s.has(pk) ? s.delete(pk) : s.add(pk); return s })
  }

  if (!pubkey) return null

  // ── derived display values ──
  const npub = nip19.npubEncode(pubkey)
  const shortNpub = `${npub.slice(0, 10)}…${npub.slice(-6)}`
  const dispName = profile?.displayName || profile?.name || shortNpub
  const identifier = profile?.nip05 || shortNpub
  const summary = summarize(evalled)
  const windowChanged = analysisPhase === 'ready' && loadedWindowDays !== rules.windowDays

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <main className="max-w-xl mx-auto px-4 py-6 space-y-6 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => { setView('profile'); setPublishDone(false) }}
          className="text-sm font-bold tracking-tight text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          switchboard
        </button>
        <button onClick={handleDisconnect} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
          Disconnect
        </button>
      </div>

      {/* ── Done screen ── */}
      {publishDone ? (
        <div className="text-center space-y-4 py-12">
          <div className="text-4xl">✓</div>
          <p className="text-zinc-200 font-medium">Follow list updated</p>
          <p className="text-zinc-500 text-sm">
            {newFollowCount !== null ? `${newFollowCount.toLocaleString()} accounts now followed` : ''}
          </p>
          <button
            onClick={() => { setPublishDone(false); setView('profile'); setAnalysisPhase('idle') }}
            className="text-zinc-500 hover:text-zinc-300 text-sm underline transition-colors"
          >
            Back to profile
          </button>
        </div>

      ) : view === 'preview' ? (
        /* ── Preview screen ── */
        <>
          <CompactProfile name={dispName} picture={profile?.picture} followCount={follows.length} />
          <DiffPreview
            evalled={evalled}
            profiles={previewProfiles}
            keepOverrides={keepOverrides}
            skipOverrides={skipOverrides}
            onKeepToggle={toggleKeep}
            onSkipToggle={toggleSkip}
            onBack={() => setView('rules')}
            onApply={handleApply}
            publishing={publishing}
            publishError={publishError}
          />
        </>

      ) : view === 'rules' ? (
        /* ── Rules screen ── */
        <>
          <CompactProfile name={dispName} picture={profile?.picture} followCount={follows.length} />

          {windowChanged && (
            <div className="text-xs text-amber-400 bg-amber-950/50 border border-amber-800 rounded-lg px-3 py-2">
              Lookback window changed.{' '}
              <button onClick={loadAnalysisData} className="underline">Reload data</button>
              {' '}to apply.
            </div>
          )}

          <RulesBuilder
            rules={rules}
            onChange={setRules}
            summary={summary}
            loaded={analysisPhase === 'ready'}
            loading={analysisPhase === 'loading'}
            loadStep={loadStep}
            onLoad={loadAnalysisData}
            onPreview={async () => {
              if (previewLoading) return
              await startPreview()
            }}
          />
        </>

      ) : (
        /* ── Profile screen ── */
        <>
          {profileLoading ? (
            <ProfileSkeleton />
          ) : (
            <>
              {/* Avatar + bio */}
              <div className="flex items-start gap-4">
                <Avatar picture={profile?.picture} name={dispName} size="lg" />
                <div className="min-w-0 flex-1 pt-1">
                  <h1 className="text-lg font-bold truncate">{dispName}</h1>
                  <p className="text-zinc-500 text-sm truncate">{identifier}</p>
                  {profile?.about && (
                    <p className="text-zinc-400 text-sm mt-2 leading-relaxed line-clamp-3">{profile.about}</p>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <StatBox value={follows.length.toLocaleString()} label="Following" />
                <StatBox
                  value={postsLast30d !== null ? (postsLast30d >= 30 ? '30+' : String(postsLast30d)) : '—'}
                  label="Notes (30d)"
                />
              </div>

              {/* CTA */}
              <button
                onClick={() => setView('rules')}
                disabled={profileLoading}
                className="w-full py-3 px-6 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
              >
                Manage Follow List →
              </button>

              {/* Recent notes */}
              {notes.length > 0 && (
                <div className="space-y-3">
                  <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Recent notes</p>
                  <div className="space-y-2">
                    {notes.map(note => (
                      <div key={note.id} className="rounded-lg border border-zinc-800 p-4 space-y-2">
                        <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                          {truncate(note.content)}
                        </p>
                        <p className="text-xs text-zinc-600">{timeAgo(note.created_at)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {notes.length === 0 && (
                <p className="text-zinc-600 text-sm text-center py-4">
                  No recent notes found on queried relays.
                </p>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}

// ─── small reusable pieces ────────────────────────────────────────────────

function Avatar({ picture, name, size = 'md' }: { picture?: string; name: string; size?: 'md' | 'lg' }) {
  const cls = size === 'lg'
    ? 'w-16 h-16 text-2xl'
    : 'w-9 h-9 text-sm'
  return picture ? (
    <img
      src={picture}
      alt={name}
      className={`${cls} rounded-full object-cover flex-shrink-0 bg-zinc-800`}
      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
    />
  ) : (
    <div className={`${cls} rounded-full flex-shrink-0 bg-zinc-800 flex items-center justify-center text-zinc-600`}>
      ◆
    </div>
  )
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-zinc-500 text-sm mt-0.5">{label}</div>
    </div>
  )
}

function CompactProfile({ name, picture, followCount }: { name: string; picture?: string; followCount: number }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar picture={picture} name={name} size="md" />
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-zinc-500 text-xs">{followCount.toLocaleString()} following</p>
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-full bg-zinc-800 flex-shrink-0" />
        <div className="space-y-2 flex-1 pt-2">
          <div className="h-5 bg-zinc-800 rounded w-36" />
          <div className="h-3 bg-zinc-800 rounded w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 bg-zinc-800 rounded-lg" />
        <div className="h-20 bg-zinc-800 rounded-lg" />
      </div>
      <div className="h-11 bg-zinc-800 rounded-lg" />
    </div>
  )
}
