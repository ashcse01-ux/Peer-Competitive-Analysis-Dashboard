import React, { useState } from 'react'
import { Clock, RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { fetch, useTriggerRefresh, type RefreshStatus } from '../api'
import {
  SYNC_CHANNEL_META,
  activeDataSnapshotSlot,
  formatIstNow,
  snapshotPolicyNote,
  type SyncChannel,
  type SyncSlot,
} from '../lib/syncSchedules'
import { cx } from '../lib/insights'

interface Props {
  channels: SyncChannel[]
  compact?: boolean
  className?: string
}

const CHANNEL_API_SOURCE: Partial<Record<SyncChannel, string>> = {
  google_play: 'google_play',
  ios_app_store: 'ios_app_store',
  google_search: 'google_search',
}

function SlotPills({ slots, activeLabel }: { slots: SyncSlot[]; activeLabel?: string | null }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {slots.map(slot => {
        const active = activeLabel === slot.label
        return (
          <span
            key={slot.label}
            className={cx(
              'rounded-full px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wide',
              active ? 'bg-[var(--fb-yellow)] text-[#0f1d35]' : 'bg-black/5 text-theme-muted dark:bg-white/10',
            )}
          >
            {slot.label.replace(' IST', '')}
          </span>
        )
      })}
    </div>
  )
}

function SyncProgressBar({
  percent,
  label,
  current,
  total,
}: {
  percent: number
  label: string
  current: number
  total: number
}) {
  const width = Math.max(4, Math.min(100, percent))
  return (
    <div className="w-full space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs font-bold">
        <span className="truncate text-theme-primary">{label}</span>
        <span className="shrink-0 tabular-nums text-theme-muted">
          {current}/{total} · {Math.round(percent)}%
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${width}%`, background: 'var(--fb-yellow)' }}
        />
      </div>
    </div>
  )
}

function errorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { message?: string; detail?: string } } })?.response?.data
  const detail = data?.detail
  if (typeof detail === 'string') return detail
  return data?.message || 'Sync could not start — another refresh may already be running.'
}

export default function SyncControlPanel({ channels, compact, className }: Props) {
  const queryClient = useQueryClient()
  const trigger = useTriggerRefresh()
  const [syncing, setSyncing] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<RefreshStatus | null>(null)

  const handleSync = async (channel: SyncChannel) => {
    const apiSource = CHANNEL_API_SOURCE[channel]
    if (!apiSource) {
      setMessage(`${SYNC_CHANNEL_META[channel].title}: marketplace sync is not wired from this panel.`)
      return
    }
    setSyncing(channel)
    setMessage('Starting sync…')
    setProgress({
      cycle_id: 1,
      status: 'loading',
      running: true,
      fetch_phase: 'Starting sync…',
      operators_ready: 0,
      last_error: null,
      triggered_at: null,
      completed_at: null,
      stale_sources: [],
      sync_channel: apiSource,
      sync_operator: '',
      sync_current: 0,
      sync_total: 7,
      sync_percent: 0,
    })
    try {
      const started = await trigger.mutateAsync(apiSource)
      const jobId = started.triggered_at
      setMessage(started.message || 'Sync started…')
      const deadline = Date.now() + 20 * 60_000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1000))
        const status = await fetch.refreshStatus()
        setProgress(status)
        const sameJob = !jobId || !status.triggered_at || status.triggered_at === jobId
        if (!sameJob && status.running) continue
        if (status.status === 'failed') {
          setMessage(`${SYNC_CHANNEL_META[channel].title}: sync failed. ${status.last_error || ''}`.trim())
          break
        }
        if (sameJob && (status.status === 'completed' || status.status === 'stale') && !status.running) {
          await queryClient.invalidateQueries({ queryKey: ['daily-snapshots'] })
          await queryClient.invalidateQueries({ queryKey: ['app-store'] })
          await queryClient.invalidateQueries({ queryKey: ['google-reviews'] })
          await queryClient.invalidateQueries({ queryKey: ['overview'] })
          setProgress({ ...status, sync_percent: 100 })
          setMessage(
            `${SYNC_CHANNEL_META[channel].title}: last scrape saved as today’s official snapshot.`,
          )
          break
        }
        const op = status.sync_operator ? ` · ${status.sync_operator}` : ''
        setMessage(`${status.fetch_phase || 'Scraping'}${op}`)
      }
    } catch (err: unknown) {
      setMessage(errorMessage(err))
    } finally {
      setSyncing(null)
    }
  }

  const bar = syncing && progress ? (
    <SyncProgressBar
      percent={progress.sync_percent ?? 0}
      label={progress.fetch_phase || progress.sync_operator || 'Syncing…'}
      current={progress.sync_current ?? 0}
      total={progress.sync_total || 7}
    />
  ) : null

  if (compact && channels.length === 1) {
    const channel = channels[0]
    const meta = SYNC_CHANNEL_META[channel]
    const active = activeDataSnapshotSlot(meta.slots)
    return (
      <div className={cx('liquid-glass flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] p-4', className)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-black uppercase tracking-wider text-theme-muted">Sync</p>
            <p className="text-sm font-bold text-theme-primary">{meta.description}</p>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-theme-secondary">
              <Clock size={12} /> Last sync of the day overwrites that day’s row · Now: {formatIstNow()}
            </p>
            <SlotPills slots={meta.slots} activeLabel={active.label} />
          </div>
          <button
            type="button"
            onClick={() => handleSync(channel)}
            disabled={syncing === channel}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-5 text-sm font-bold text-[#0f1d35] shadow-sm disabled:opacity-60"
            style={{ background: 'var(--fb-yellow)' }}
          >
            <RefreshCw size={16} className={syncing === channel ? 'animate-spin' : ''} />
            {syncing === channel ? 'Syncing…' : `Sync ${meta.title}`}
          </button>
        </div>
        {bar}
        {message ? <p className="text-xs font-semibold text-theme-secondary">{message}</p> : null}
      </div>
    )
  }

  return (
    <section className={cx('liquid-glass chart-panel panel-shell overflow-hidden', className)}>
      <header className="panel-header panel-header--divider">
        <div className="panel-header-copy">
          <p className="panel-kicker">Data pipeline</p>
          <h2 className="section-title">Sync controls</h2>
          <p className="chart-subtitle">
            Sync scrapes live ratings for all 7 operators. You can sync as often as you want; only the last scrape of each IST day is stored.
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-theme-muted">
            <Clock size={12} /> Server time (IST): {formatIstNow()}
          </p>
        </div>
      </header>
      <div className="visual-body grid gap-4 lg:grid-cols-3">
        {channels.map(channel => {
          const meta = SYNC_CHANNEL_META[channel]
          const active = activeDataSnapshotSlot(meta.slots)
          const activeBar = syncing === channel ? bar : null
          return (
            <article key={channel} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
              <h3 className="font-extrabold text-theme-primary">{meta.title}</h3>
              <p className="mt-1 text-sm font-semibold text-theme-secondary">{meta.description}</p>
              <div className="mt-3 space-y-2 text-xs font-semibold text-theme-muted">
                <p>Active snapshot: {active.label}</p>
                <p>{meta.oncePerDay ? 'One row per calendar day (last sync wins)' : snapshotPolicyNote(meta.slots)}</p>
                <SlotPills slots={meta.slots} activeLabel={active.label} />
              </div>
              {activeBar ? <div className="mt-3">{activeBar}</div> : null}
              <button
                type="button"
                onClick={() => handleSync(channel)}
                disabled={Boolean(syncing)}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--fb-blue)] text-sm font-bold text-white disabled:opacity-60"
              >
                <RefreshCw size={15} className={syncing === channel ? 'animate-spin' : ''} />
                {syncing === channel ? 'Syncing…' : 'Sync now'}
              </button>
            </article>
          )
        })}
      </div>
      {message ? <p className="visual-body border-t border-[var(--border-subtle)] pt-3 text-sm font-semibold text-theme-secondary">{message}</p> : null}
    </section>
  )
}
