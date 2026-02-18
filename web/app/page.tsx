'use client'

// Landing page — NIP-07 login
//
// Session stored in localStorage after login.
// Only calls window.nostr on explicit button click (required for Safari —
// calling getPublicKey() silently on mount triggers unprompted popups that
// Safari blocks).

import { useEffect, useRef, useState } from 'react'
import { connectBunker } from '@/lib/bunker'

export default function Home() {
  const [loggingIn, setLoggingIn] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Bunker direct connect
  const [bunkerOpen, setBunkerOpen] = useState(false)
  const [bunkerURL, setBunkerURL] = useState('')
  const [bunkerConnecting, setBunkerConnecting] = useState(false)
  const [bunkerError, setBunkerError] = useState<string | null>(null)

  // Restore existing session from localStorage — no Nostr call needed
  useEffect(() => {
    const stored = localStorage.getItem('nostr_pubkey')
    if (stored) {
      window.location.href = '/dashboard'
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  function completeLogin(pubkey: string) {
    if (pollRef.current) clearInterval(pollRef.current)
    localStorage.setItem('nostr_pubkey', pubkey)
    window.location.href = '/dashboard'
  }

  // Poll getPublicKey() after the NIP-46 widget opens — auto-login once
  // the handshake completes.
  function startPolling() {
    setWaiting(true)
    pollRef.current = setInterval(async () => {
      try {
        if (!window.nostr) return
        const pk = await window.nostr.getPublicKey()
        if (pk) completeLogin(pk)
      } catch { /* handshake not done yet */ }
    }, 2000)
    // Stop after 2 minutes
    setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
        setWaiting(false)
        setLoggingIn(false)
        setError('Connection timed out. Please try again.')
      }
    }, 120_000)
  }

  async function handleLogin() {
    setLoggingIn(true)
    setError(null)
    try {
      if (!window.nostr) {
        throw new Error('No Nostr signer found. Install Alby or nos2x, or use a NIP-46 bunker.')
      }
      const pubkey = await window.nostr.getPublicKey()
      if (pubkey) { completeLogin(pubkey); return }
    } catch {
      // getPublicKey() failed — NIP-46 widget may have opened.
      // Start polling so we auto-login once the handshake finishes.
    }
    startPolling()
  }

  async function handleBunkerConnect() {
    const url = bunkerURL.trim()
    if (!url) return
    setBunkerConnecting(true)
    setBunkerError(null)
    try {
      const pubkey = await connectBunker(url)
      completeLogin(pubkey)
    } catch (err) {
      setBunkerError(err instanceof Error ? err.message : 'Failed to connect to bunker')
    } finally {
      setBunkerConnecting(false)
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
            className="w-full py-3.5 px-6 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {waiting ? 'Waiting for signer…' : loggingIn ? 'Connecting…' : 'Login with Nostr'}
          </button>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <p className="text-zinc-600 text-xs">
            Works with Alby, nos2x, and any NIP-07 extension.
            No extension? Connect via NIP-46 remote signer.
          </p>

          {/* Bunker direct connect */}
          <div className="pt-2">
            <button
              onClick={() => setBunkerOpen(!bunkerOpen)}
              className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
            >
              {bunkerOpen ? '▾' : '▸'} Connect with bunker URL
            </button>
            {bunkerOpen && (
              <div className="mt-3 space-y-3">
                <input
                  type="text"
                  value={bunkerURL}
                  onChange={e => setBunkerURL(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleBunkerConnect() }}
                  placeholder="bunker://..."
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={handleBunkerConnect}
                  disabled={bunkerConnecting || !bunkerURL.trim()}
                  className="w-full py-2.5 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                >
                  {bunkerConnecting ? 'Connecting…' : 'Connect'}
                </button>
                {bunkerError && (
                  <p className="text-red-400 text-sm">{bunkerError}</p>
                )}
                <p className="text-zinc-600 text-xs">
                  Paste your bunker:// URL from nsec.app or another NIP-46 signer.
                  Useful in PWA mode or when browser extensions aren&apos;t available.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="pt-8 border-t border-zinc-800 text-left space-y-3">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">What it does</p>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>✂ Remove follows who haven&apos;t posted in N months</li>
            <li>＋ Auto-follow people who reply, repost, or zap you</li>
            <li>🔒 Protect specific accounts with a hall pass</li>
            <li>👁 Preview all changes before they go live</li>
          </ul>
        </div>

      </div>
    </main>
  )
}
