'use client'

// Landing page — NIP-07 login
//
// Session stored in localStorage after login.
// Only calls window.nostr on explicit button click (required for Safari —
// calling getPublicKey() silently on mount triggers unprompted popups that
// Safari blocks).

import { useEffect, useState } from 'react'

export default function Home() {
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Restore existing session from localStorage — no Nostr call needed
  useEffect(() => {
    const stored = localStorage.getItem('nostr_pubkey')
    if (stored) {
      window.location.href = '/dashboard'
    }
  }, [])

  async function handleLogin() {
    setLoggingIn(true)
    setError(null)
    try {
      if (!window.nostr) {
        throw new Error('No Nostr signer found. Install Alby or nos2x, or use a NIP-46 bunker.')
      }
      const pubkey = await window.nostr.getPublicKey()
      localStorage.setItem('nostr_pubkey', pubkey)
      window.location.href = '/dashboard'
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
