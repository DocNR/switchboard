'use client'

// Dashboard — profile view + follow list management
//
// Reads pubkey from localStorage (set at login).
// Shows profile card, stats, and recent notes at the top.
// Rules builder and diff preview will go below (TODO).

import { useEffect, useState } from 'react'
import { fetchFollowList, fetchProfiles, fetchRecentNotes } from '@/lib/nostr'
import type { Profile } from '@/lib/types'
import { nip19 } from 'nostr-tools'
import type { Event } from 'nostr-tools'

function timeAgo(unixSeconds: number): string {
  const s = Math.floor(Date.now() / 1000) - unixSeconds
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

function truncate(text: string, max = 300): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

export default function DashboardPage() {
  const [pubkey, setPubkey] = useState<string>('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [followCount, setFollowCount] = useState<number | null>(null)
  const [notes, setNotes] = useState<Event[]>([])
  const [postsLast30d, setPostsLast30d] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('nostr_pubkey')
    if (!stored) {
      window.location.href = '/'
      return
    }
    setPubkey(stored)
    loadData(stored)
  }, [])

  async function loadData(pk: string) {
    setLoading(true)
    try {
      // Fetch profile, follow list, and recent notes in parallel
      const [profileMap, { follows }, recentNotes] = await Promise.all([
        fetchProfiles([pk]),
        fetchFollowList(pk),
        fetchRecentNotes(pk, 30),
      ])

      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60

      setProfile(profileMap.get(pk) ?? null)
      setFollowCount(follows.length)
      setNotes(recentNotes.slice(0, 10))
      setPostsLast30d(recentNotes.filter(n => n.created_at >= thirtyDaysAgo).length)
    } catch (err) {
      console.error('Failed to load profile:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleDisconnect() {
    localStorage.removeItem('nostr_pubkey')
    window.location.href = '/'
  }

  if (!pubkey) return null

  const npub = pubkey ? nip19.npubEncode(pubkey) : ''
  const shortNpub = npub ? `${npub.slice(0, 10)}…${npub.slice(-6)}` : ''
  const displayName = profile?.displayName || profile?.name || shortNpub
  const identifier = profile?.nip05 || shortNpub

  return (
    <main className="max-w-xl mx-auto px-4 py-6 space-y-6 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold tracking-tight text-zinc-400">switchboard</span>
        <button
          onClick={handleDisconnect}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Disconnect
        </button>
      </div>

      {loading ? (
        /* Skeleton */
        <div className="space-y-4 animate-pulse">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex-shrink-0" />
            <div className="space-y-2 flex-1 pt-2">
              <div className="h-5 bg-zinc-800 rounded w-36" />
              <div className="h-3 bg-zinc-800 rounded w-24" />
              <div className="h-3 bg-zinc-800 rounded w-full mt-2" />
              <div className="h-3 bg-zinc-800 rounded w-3/4" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-20 bg-zinc-800 rounded-lg" />
            <div className="h-20 bg-zinc-800 rounded-lg" />
          </div>
          <div className="h-11 bg-zinc-800 rounded-lg" />
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-24 bg-zinc-800 rounded-lg" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Profile card */}
          <div className="flex items-start gap-4">
            {profile?.picture ? (
              <img
                src={profile.picture}
                alt={displayName}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover flex-shrink-0 bg-zinc-800"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-zinc-800 flex-shrink-0 flex items-center justify-center text-zinc-600 text-2xl">
                ◆
              </div>
            )}
            <div className="min-w-0 flex-1 pt-1">
              <h1 className="text-lg font-bold truncate">{displayName}</h1>
              <p className="text-zinc-500 text-sm truncate">{identifier}</p>
              {profile?.about && (
                <p className="text-zinc-400 text-sm mt-2 leading-relaxed line-clamp-3">
                  {profile.about}
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
              <div className="text-2xl font-bold tabular-nums">
                {followCount !== null ? followCount.toLocaleString() : '—'}
              </div>
              <div className="text-zinc-500 text-sm mt-0.5">Following</div>
            </div>
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
              <div className="text-2xl font-bold tabular-nums">
                {postsLast30d !== null
                  ? postsLast30d >= 30 ? '30+' : postsLast30d
                  : '—'}
              </div>
              <div className="text-zinc-500 text-sm mt-0.5">Notes (30d)</div>
            </div>
          </div>

          {/* CTA */}
          <div className="rounded-lg border border-zinc-800 border-dashed p-6 text-center space-y-3">
            <p className="text-zinc-400 font-medium">Manage Follow List</p>
            <p className="text-zinc-600 text-sm">
              Rules builder coming soon — prune inactive follows and auto-follow your engagers.
            </p>
            <p className="text-zinc-700 text-xs">
              {followCount !== null ? `${followCount.toLocaleString()} follows loaded` : 'Loading…'}
            </p>
          </div>

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

    </main>
  )
}
