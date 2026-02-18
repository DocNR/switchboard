'use client'

// Landing page — shown before login
// After login, window.nostr.js sets window.nostr and we redirect to /dashboard
//
// TODO: Replace the redirect with proper app state management once
// the dashboard page is built out.

import { useEffect, useState } from 'react'

export default function Home() {
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if already logged in on page load
  useEffect(() => {
    checkExistingLogin()
  }, [])

  async function checkExistingLogin() {
    try {
      // window.nostr is injected by the NIP-07 extension or window.nostr.js
      if (typeof window !== 'undefined' && window.nostr) {
        const pubkey = await window.nostr.getPublicKey()
        if (pubkey) {
          window.location.href = `/dashboard?pubkey=${pubkey}`
        }
      }
    } catch {
      // Not logged in yet — that's fine
    }
  }

  async function handleLogin() {
    setLoggingIn(true)
    setError(null)
    try {
      if (!window.nostr) {
        throw new Error('No Nostr signer found. Install Alby or nos2x, or use a NIP-46 bunker.')
      }
      const pubkey = await window.nostr.getPublicKey()
      window.location.href = `/dashboard?pubkey=${pubkey}`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setLoggingIn(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8 text-center">

        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">switchboard</h1>
          <p className="text-zinc-400 text-lg">
            Rules-based Nostr follow list manager.
          </p>
          <p className="text-zinc-500 text-sm">
            Prune inactive follows. Auto-follow people who engage with you.
            No keys leave your browser.
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleLogin}
            disabled={loggingIn}
            className="w-full py-3 px-6 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {loggingIn ? 'Connecting...' : 'Login with Nostr'}
          </button>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <p className="text-zinc-600 text-xs">
            Works with Alby, nos2x, and any NIP-07 extension.
            No extension? A login widget will appear automatically.
          </p>
        </div>

        <div className="pt-8 border-t border-zinc-800 text-left space-y-3">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">What it does</p>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>✂ Remove follows who haven&apos;t posted in N months</li>
            <li>＋ Auto-follow people who reply, repost, or zap you</li>
            <li>🔒 Protect specific accounts with an allowlist</li>
            <li>👁 Preview all changes before they go live</li>
          </ul>
        </div>

      </div>
    </main>
  )
}
