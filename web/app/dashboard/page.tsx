'use client'

// Dashboard — main app view after login
//
// Current state: PLACEHOLDER
// This page shows the logged-in pubkey and follow count.
//
// TODO (good first issues — see CLAUDE.md):
//   1. Fetch and display the user's follow list
//   2. Add the RulesBuilder component
//   3. Fetch engagement data and run rules evaluation
//   4. Add DiffPreview component
//   5. Add publish flow

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { fetchFollowList } from '@/lib/nostr'
import { nip19 } from 'nostr-tools'

function Dashboard() {
  const searchParams = useSearchParams()
  const pubkey = searchParams.get('pubkey') ?? ''

  const [followCount, setFollowCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const npub = pubkey ? nip19.npubEncode(pubkey) : ''
  const shortNpub = npub ? `${npub.slice(0, 12)}...${npub.slice(-6)}` : ''

  useEffect(() => {
    if (!pubkey) return
    loadFollowList()
  }, [pubkey])

  async function loadFollowList() {
    setLoading(true)
    try {
      const { follows } = await fetchFollowList(pubkey)
      setFollowCount(follows.length)
    } catch (err) {
      console.error('Failed to fetch follow list:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleDisconnect() {
    window.location.href = '/'
  }

  if (!pubkey) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">No pubkey found. <a href="/" className="text-purple-400 underline">Go back</a></p>
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto p-8 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">switchboard</h1>
        <div className="flex items-center gap-4">
          <span className="text-zinc-500 text-sm font-mono">{shortNpub}</span>
          <button
            onClick={handleDisconnect}
            className="text-sm text-zinc-500 hover:text-white transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Follow count */}
      <div className="rounded-lg border border-zinc-800 p-6">
        {loading ? (
          <p className="text-zinc-500">Loading follow list...</p>
        ) : (
          <div className="space-y-1">
            <p className="text-3xl font-bold">{followCount?.toLocaleString()}</p>
            <p className="text-zinc-500">accounts followed</p>
          </div>
        )}
      </div>

      {/* Placeholder for rules builder */}
      <div className="rounded-lg border border-zinc-800 border-dashed p-8 text-center space-y-3">
        <p className="text-zinc-400 font-medium">Rules Builder</p>
        <p className="text-zinc-600 text-sm">
          Coming soon — see <code className="text-zinc-500">CLAUDE.md</code> for how to build this.
        </p>
      </div>

      {/* Placeholder for diff preview */}
      <div className="rounded-lg border border-zinc-800 border-dashed p-8 text-center space-y-3">
        <p className="text-zinc-400 font-medium">Preview Changes</p>
        <p className="text-zinc-600 text-sm">
          Will show adds, removes, and protected follows before publishing.
        </p>
      </div>

    </main>
  )
}

// Suspense boundary required for useSearchParams in Next.js App Router
export default function DashboardPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </main>
    }>
      <Dashboard />
    </Suspense>
  )
}
