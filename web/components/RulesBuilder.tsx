'use client'

import { useState } from 'react'
import { nip19 } from 'nostr-tools'
import type { Rules, AddRule, RemoveRule } from '@/lib/types'
import { summarize } from '@/lib/rules'

const ADD_META: Record<string, { label: string; unit: string }> = {
  replies:   { label: 'Replied to me',  unit: 'times' },
  zaps_sats: { label: 'Zapped me',      unit: 'sats'  },
  reposts:   { label: 'Reposted me',    unit: 'times' },
  quotes:    { label: 'Quoted me',      unit: 'times' },
  reactions: { label: 'Reacted to me', unit: 'times' },
}

const REMOVE_META: Record<string, { label: string; unit: string; hasThreshold: boolean }> = {
  inactive_days:    { label: "Hasn't posted in",      unit: 'days', hasThreshold: true  },
  no_profile:       { label: 'No profile set up',     unit: '',     hasThreshold: false },
  never_engaged_me: { label: 'Never engaged with me', unit: '',     hasThreshold: false },
}

interface Summary {
  total: number
  adding: number
  removing: number
  keeping: number
  protected: number
  tooNew: number
}

interface RulesBuilderProps {
  rules: Rules
  onChange: (rules: Rules) => void
  summary: Summary
  loaded: boolean
  loading: boolean
  loadStep: string
  onLoad: () => void
  onPreview: () => void
}

export default function RulesBuilder({
  rules,
  onChange,
  summary,
  loaded,
  loading,
  loadStep,
  onLoad,
  onPreview,
}: RulesBuilderProps) {
  function updateAdd(index: number, patch: Partial<AddRule>) {
    onChange({ ...rules, add: rules.add.map((r, i) => i === index ? { ...r, ...patch } : r) })
  }

  function updateRemove(index: number, patch: Partial<RemoveRule>) {
    onChange({ ...rules, remove: rules.remove.map((r, i) => i === index ? { ...r, ...patch } : r) })
  }

  const hasChanges = summary.removing > 0 || summary.adding > 0
  const enabledAddRules = rules.add.filter(r => r.enabled).length
  const enabledRemoveRules = rules.remove.filter(r => r.enabled).length

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
        <span className="text-zinc-500 text-sm">days (ADD rules)</span>
      </div>

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
        <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Remove rules — prune inactive follows</p>
        {rules.remove.map((rule, i) => {
          const meta = REMOVE_META[rule.signal]
          return (
            <label key={rule.signal} className="flex items-center gap-3 py-0.5 cursor-pointer">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={e => updateRemove(i, { enabled: e.target.checked })}
                className="w-4 h-4 flex-shrink-0 accent-purple-500"
              />
              <span className={`text-sm flex-1 ${rule.enabled ? 'text-zinc-300' : 'text-zinc-600'}`}>
                {meta.label}
              </span>
              {meta.hasThreshold ? (
                <>
                  <input
                    type="number"
                    value={rule.threshold}
                    disabled={!rule.enabled}
                    onChange={e => updateRemove(i, { threshold: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-right disabled:opacity-30 disabled:cursor-not-allowed"
                    min={1}
                  />
                  <span className={`text-xs w-8 flex-shrink-0 ${rule.enabled ? 'text-zinc-500' : 'text-zinc-700'}`}>
                    {meta.unit}
                  </span>
                </>
              ) : (
                <div className="w-28 flex-shrink-0" /> /* spacer to align checkboxes */
              )}
            </label>
          )
        })}
      </div>

      {/* Allowlist */}
      <div className="space-y-2">
        <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Protected follows</p>
        <AllowlistEditor
          allowlist={rules.allowlist}
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
      </div>

      {/* Load / Loading / Summary */}
      <div className="pt-2 space-y-4">
        {loading ? (
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-zinc-400 text-sm">{loadStep || 'Loading...'}</p>
            </div>
          </div>
        ) : !loaded ? (
          <button
            onClick={onLoad}
            disabled={enabledAddRules + enabledRemoveRules === 0}
            className="w-full py-3 px-6 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {enabledAddRules + enabledRemoveRules === 0
              ? 'Enable at least one rule to analyze'
              : 'Analyze My Follows →'}
          </button>
        ) : (
          <>
            {/* Live summary */}
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

function AllowlistEditor({
  allowlist,
  onAdd,
  onRemove,
}: {
  allowlist: string[]
  onAdd: (input: string) => void
  onRemove: (pubkey: string) => void
}) {
  const [input, setInput] = useState('')

  function handleAdd() {
    if (!input.trim()) return
    onAdd(input.trim())
    setInput('')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="npub1... or hex pubkey"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm placeholder-zinc-600 min-w-0"
        />
        <button
          onClick={handleAdd}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm transition-colors flex-shrink-0"
        >
          Add
        </button>
      </div>
      {allowlist.length === 0 && (
        <p className="text-zinc-700 text-xs">No protected follows. Paste an npub or hex pubkey to add one.</p>
      )}
      {allowlist.map(pk => {
        const npub = nip19.npubEncode(pk)
        const short = `${npub.slice(0, 10)}…${npub.slice(-6)}`
        return (
          <div key={pk} className="flex items-center justify-between">
            <span className="text-zinc-400 text-sm font-mono">{short}</span>
            <button
              onClick={() => onRemove(pk)}
              className="text-zinc-600 hover:text-red-400 text-xs transition-colors ml-3"
            >
              Remove
            </button>
          </div>
        )
      })}
    </div>
  )
}
