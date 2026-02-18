'use client'

import { useState } from 'react'
import { nip19 } from 'nostr-tools'
import type { Rules, AddRule, RemoveRule, Profile } from '@/lib/types'

const ADD_META: Record<string, { label: string; unit: string }> = {
  replies:   { label: 'Replied to me',  unit: 'times' },
  zaps_sats: { label: 'Zapped me',      unit: 'sats'  },
  reposts:   { label: 'Reposted me',    unit: 'times' },
  quotes:    { label: 'Quoted me',      unit: 'times' },
  reactions: { label: 'Reacted to me', unit: 'times' },
}

const REMOVE_META: Record<string, { label: string; unit: string; hasThreshold: boolean; risky?: boolean }> = {
  inactive_days:       { label: 'Confirmed inactive — last post older than',  unit: 'days', hasThreshold: true  },
  not_found_on_relays: { label: 'Not found on any queried relay',             unit: '',     hasThreshold: false, risky: true },
  no_zaps:             { label: 'Zapped me less than',                        unit: 'sats', hasThreshold: true  },
  no_profile:          { label: 'No profile set up',                          unit: '',     hasThreshold: false },
  never_engaged_me:    { label: 'Never engaged with me (in lookback window)', unit: '',     hasThreshold: false },
}

interface Summary {
  total: number
  adding: number
  removing: number
  keeping: number
  protected: number
  tooNew: number
  lastPostFound: number
}

interface RulesBuilderProps {
  rules: Rules
  onChange: (rules: Rules) => void
  relays: string[]
  onRelaysChange: (relays: string[]) => void
  onDetectRelays: () => Promise<void>
  summary: Summary
  loaded: boolean
  loading: boolean
  loadStep: string
  onLoad: () => void
  onPreview: () => void
  onSaveAllowlist: () => Promise<void>
  allowlistSaving: boolean
  allowlistSaved: boolean
  followProfiles: Map<string, Profile>
}

export default function RulesBuilder({
  rules,
  onChange,
  relays,
  onRelaysChange,
  onDetectRelays,
  summary,
  loaded,
  loading,
  loadStep,
  onLoad,
  onPreview,
  onSaveAllowlist,
  allowlistSaving,
  allowlistSaved,
  followProfiles,
}: RulesBuilderProps) {
  const [showRelays, setShowRelays] = useState(false)
  const [detectingRelays, setDetectingRelays] = useState(false)

  function updateAdd(index: number, patch: Partial<AddRule>) {
    onChange({ ...rules, add: rules.add.map((r, i) => i === index ? { ...r, ...patch } : r) })
  }

  function updateRemove(index: number, patch: Partial<RemoveRule>) {
    onChange({ ...rules, remove: rules.remove.map((r, i) => i === index ? { ...r, ...patch } : r) })
  }

  async function handleDetectRelays() {
    setDetectingRelays(true)
    try { await onDetectRelays() } finally { setDetectingRelays(false) }
  }

  const hasChanges = summary.removing > 0 || summary.adding > 0
  const enabledRules = [...rules.add, ...rules.remove].filter(r => r.enabled).length

  return (
    <div className="space-y-6">

      {/* Lookback window */}
      <div className="flex items-center gap-3">
        <span className="text-zinc-400 text-sm">Lookback window</span>
        <input
          type="number"
          value={rules.windowDays}
          onChange={e => onChange({ ...rules, windowDays: Math.max(1, parseInt(e.target.value) || 1) })}
          className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-center"
          min={1} max={365}
        />
        <span className="text-zinc-500 text-sm">days (ADD rules + engagement REMOVE rules)</span>
      </div>
      <p className="text-zinc-700 text-xs -mt-3">
        Changing this requires a re-analysis. All other rule thresholds apply instantly.
      </p>

      {/* ADD rules */}
      <div className="space-y-2">
        <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Add rules — auto-follow engagers</p>
        {rules.add.map((rule, i) => {
          const meta = ADD_META[rule.signal]
          return (
            <label key={rule.signal} className="flex items-center gap-3 py-0.5 cursor-pointer">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={e => updateAdd(i, { enabled: e.target.checked })}
                className="w-4 h-4 flex-shrink-0 accent-purple-500"
              />
              <span className={`text-sm flex-1 ${rule.enabled ? 'text-zinc-300' : 'text-zinc-600'}`}>
                {meta.label}
              </span>
              <span className="text-zinc-600 text-xs">≥</span>
              <input
                type="number"
                value={rule.threshold}
                disabled={!rule.enabled}
                onChange={e => updateAdd(i, { threshold: Math.max(1, parseInt(e.target.value) || 1) })}
                className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-right disabled:opacity-30 disabled:cursor-not-allowed"
                min={1}
              />
              <span className={`text-xs w-8 flex-shrink-0 ${rule.enabled ? 'text-zinc-500' : 'text-zinc-700'}`}>
                {meta.unit}
              </span>
            </label>
          )
        })}

        <div className="flex items-center gap-3 pt-1">
          <span className="text-zinc-500 text-sm flex-1">Min account age</span>
          <input
            type="number"
            value={rules.minAccountAgeDays}
            onChange={e => onChange({ ...rules, minAccountAgeDays: Math.max(0, parseInt(e.target.value) || 0) })}
            className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-right"
            min={0}
          />
          <span className="text-zinc-500 text-xs w-8 flex-shrink-0">days</span>
        </div>
      </div>

      {/* REMOVE rules */}
      <div className="space-y-2">
        <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">
          Remove rules — match ANY enabled rule to trigger removal
        </p>
        {rules.remove.map((rule, i) => {
          const meta = REMOVE_META[rule.signal]
          return (
            <div key={rule.signal}>
              <label className="flex items-center gap-3 py-0.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={e => updateRemove(i, { enabled: e.target.checked })}
                  className="w-4 h-4 flex-shrink-0 accent-purple-500"
                />
                <span className={`text-sm flex-1 ${rule.enabled ? (meta.risky ? 'text-amber-400' : 'text-zinc-300') : 'text-zinc-600'}`}>
                  {meta.label}
                  {meta.risky && <span className="text-amber-600 text-xs ml-1">(high false positive risk)</span>}
                </span>
                {meta.hasThreshold ? (
                  <>
                    <input
                      type="number"
                      value={rule.threshold}
                      disabled={!rule.enabled}
                      onChange={e => updateRemove(i, { threshold: Math.max(0, parseInt(e.target.value) || 0) })}
                      className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-right disabled:opacity-30 disabled:cursor-not-allowed"
                      min={0}
                    />
                    <span className={`text-xs w-8 flex-shrink-0 ${rule.enabled ? 'text-zinc-500' : 'text-zinc-700'}`}>
                      {meta.unit}
                    </span>
                  </>
                ) : (
                  <div className="w-28 flex-shrink-0" />
                )}
              </label>
            </div>
          )
        })}
      </div>

      {/* Allowlist */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Protected follows</p>
          <button
            onClick={onSaveAllowlist}
            disabled={allowlistSaving || allowlistSaved}
            className="text-xs px-2.5 py-1 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors"
          >
            {allowlistSaving ? 'Saving…' : allowlistSaved ? '✓ Saved to Nostr' : 'Save to Nostr'}
          </button>
        </div>
        <AllowlistEditor
          allowlist={rules.allowlist}
          followProfiles={followProfiles}
          onAdd={input => {
            try {
              const hex = input.startsWith('npub1') ? (nip19.decode(input).data as string) : input
              if (/^[0-9a-f]{64}$/i.test(hex) && !rules.allowlist.includes(hex)) {
                onChange({ ...rules, allowlist: [...rules.allowlist, hex] })
              }
            } catch { /* invalid input */ }
          }}
          onRemove={pk => onChange({ ...rules, allowlist: rules.allowlist.filter(p => p !== pk) })}
        />
        <p className="text-zinc-700 text-xs">Loaded from and saved to a NIP-51 follow set on your relays.</p>
      </div>

      {/* Relay settings */}
      <div className="space-y-2">
        <button
          onClick={() => setShowRelays(v => !v)}
          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
        >
          <span>{showRelays ? '▾' : '▸'}</span>
          <span className="font-medium uppercase tracking-wider">
            Relay settings — {relays.length} relay{relays.length !== 1 ? 's' : ''} queried
          </span>
        </button>

        {showRelays && (
          <RelayEditor
            relays={relays}
            onChange={onRelaysChange}
            onDetect={handleDetectRelays}
            detecting={detectingRelays}
          />
        )}
      </div>

      {/* Load / Loading / Summary */}
      <div className="pt-2 space-y-4">
        {loading ? (
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-zinc-400 text-sm">{loadStep || 'Loading…'}</p>
            </div>
          </div>
        ) : !loaded ? (
          <button
            onClick={onLoad}
            disabled={enabledRules === 0}
            className="w-full py-3 px-6 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {enabledRules === 0 ? 'Enable at least one rule to analyze' : 'Analyze My Follows →'}
          </button>
        ) : (
          <>
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-2xl font-bold text-red-400 tabular-nums">{summary.removing}</div>
                <div className="text-zinc-500 text-xs mt-0.5">Removing</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400 tabular-nums">{summary.adding}</div>
                <div className="text-zinc-500 text-xs mt-0.5">Adding</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-zinc-400 tabular-nums">
                  {summary.keeping + summary.protected}
                </div>
                <div className="text-zinc-500 text-xs mt-0.5">Keeping</div>
              </div>
            </div>

            <p className="text-zinc-700 text-xs text-center">Rule changes apply instantly — tweak thresholds freely.</p>

            {/* Relay coverage diagnostic */}
            {summary.total > 0 && (
              <p className="text-zinc-700 text-xs text-center">
                Last post visible for{' '}
                <span className={summary.lastPostFound < summary.total * 0.5 ? 'text-amber-600' : 'text-zinc-500'}>
                  {summary.lastPostFound}/{summary.total}
                </span>
                {' '}follows — {summary.total - summary.lastPostFound} not visible on current relays
              </p>
            )}

            {summary.tooNew > 0 && (
              <p className="text-zinc-600 text-xs text-center">
                {summary.tooNew} engager{summary.tooNew !== 1 ? 's' : ''} excluded — account too new
              </p>
            )}
            {summary.protected > 0 && (
              <p className="text-zinc-600 text-xs text-center">
                {summary.protected} protected by allowlist
              </p>
            )}

            <button
              onClick={onPreview}
              disabled={!hasChanges}
              className="w-full py-3 px-6 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {hasChanges ? 'Preview Changes →' : 'No changes with current rules'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── sub-components ───────────────────────────────────────────────────────

function AllowlistEditor({
  allowlist,
  followProfiles,
  onAdd,
  onRemove,
}: {
  allowlist: string[]
  followProfiles: Map<string, Profile>
  onAdd: (input: string) => void
  onRemove: (pubkey: string) => void
}) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const needle = input.trim().toLowerCase()
  const suggestions = needle.length >= 2
    ? [...followProfiles.entries()]
        .filter(([pk, p]) => {
          if (allowlist.includes(pk)) return false
          const name = (p.displayName || p.name || '').toLowerCase()
          const npub = nip19.npubEncode(pk)
          return name.includes(needle) || npub.includes(needle)
        })
        .slice(0, 8)
    : []

  function handleAdd(value = input) {
    if (!value.trim()) return
    onAdd(value.trim())
    setInput('')
    setShowSuggestions(false)
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => { setInput(e.target.value); setShowSuggestions(true) }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder={followProfiles.size > 0 ? 'Search by name or paste npub1…' : 'Paste npub1… or hex pubkey'}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm placeholder-zinc-600 min-w-0"
          />
          <button
            onClick={() => handleAdd()}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm transition-colors flex-shrink-0"
          >
            Add
          </button>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden shadow-xl">
            {suggestions.map(([pk, p]) => {
              const name = p.displayName || p.name || null
              const npub = nip19.npubEncode(pk)
              const short = `${npub.slice(0, 10)}…${npub.slice(-6)}`
              return (
                <button
                  key={pk}
                  onMouseDown={() => handleAdd(pk)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-800 transition-colors text-left"
                >
                  {p.picture ? (
                    <img
                      src={p.picture}
                      alt={name ?? short}
                      className="w-6 h-6 rounded-full flex-shrink-0 bg-zinc-800 object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full flex-shrink-0 bg-zinc-800" />
                  )}
                  <span className="text-sm text-zinc-200 truncate flex-1">{name ?? short}</span>
                  {name && <span className="text-xs text-zinc-600 flex-shrink-0 font-mono">{short}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {allowlist.length === 0 && (
        <p className="text-zinc-700 text-xs">No protected follows yet.</p>
      )}
      {allowlist.map(pk => {
        const p = followProfiles.get(pk)
        const name = p?.displayName || p?.name || null
        const npub = nip19.npubEncode(pk)
        const short = `${npub.slice(0, 10)}…${npub.slice(-6)}`
        return (
          <div key={pk} className="flex items-center gap-2.5">
            {p?.picture ? (
              <img
                src={p.picture}
                alt={name ?? short}
                className="w-6 h-6 rounded-full flex-shrink-0 bg-zinc-800 object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="w-6 h-6 rounded-full flex-shrink-0 bg-zinc-800" />
            )}
            <span className="text-zinc-300 text-sm truncate flex-1">{name ?? short}</span>
            {name && <span className="text-zinc-600 text-xs font-mono flex-shrink-0">{short}</span>}
            <button
              onClick={() => onRemove(pk)}
              className="text-zinc-600 hover:text-red-400 text-xs transition-colors ml-1 flex-shrink-0"
            >
              Remove
            </button>
          </div>
        )
      })}
    </div>
  )
}

function RelayEditor({
  relays,
  onChange,
  onDetect,
  detecting,
}: {
  relays: string[]
  onChange: (relays: string[]) => void
  onDetect: () => void
  detecting: boolean
}) {
  const [input, setInput] = useState('')

  function handleAdd() {
    const url = input.trim()
    if (!url) return
    const normalized = url.startsWith('wss://') || url.startsWith('ws://') ? url : `wss://${url}`
    if (!relays.includes(normalized)) onChange([...relays, normalized])
    setInput('')
  }

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <p className="text-zinc-600 text-xs">
        Accounts that only post to relays not listed here will appear inactive.
        Add relays your community uses to reduce false positives.
      </p>

      <div className="space-y-1">
        {relays.map(relay => (
          <div key={relay} className="flex items-center justify-between py-0.5">
            <span className="text-zinc-400 text-sm font-mono truncate">{relay.replace('wss://', '')}</span>
            <button
              onClick={() => onChange(relays.filter(r => r !== relay))}
              disabled={relays.length <= 1}
              className="text-zinc-600 hover:text-red-400 text-xs transition-colors ml-3 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="relay.example.com"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm placeholder-zinc-600 min-w-0"
        />
        <button
          onClick={handleAdd}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-sm transition-colors flex-shrink-0"
        >
          Add
        </button>
      </div>

      <button
        onClick={onDetect}
        disabled={detecting}
        className="w-full py-2 px-3 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-400 text-xs transition-colors disabled:opacity-50"
      >
        {detecting ? 'Detecting…' : 'Auto-detect from extension'}
      </button>
    </div>
  )
}
