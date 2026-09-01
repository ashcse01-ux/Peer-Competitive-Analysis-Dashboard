import React, { useState } from 'react'
import { Clock, RefreshCw } from 'lucide-react'
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

export default function SyncControlPanel({ channels, compact, className }: Props) {
  const [syncing, setSyncing] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSync = async (channel: SyncChannel) => {
    setSyncing(channel)
    setMessage(null)
    await new Promise(r => setTimeout(r, 900))
    const meta = SYNC_CHANNEL_META[channel]
    const slot = activeDataSnapshotSlot(meta.slots)
    setMessage(
      meta.oncePerDay
        ? `${meta.title}: view refreshed from ${slot.label} daily snapshot.`
        : `${meta.title}: view refreshed from ${slot.label} window. ${snapshotPolicyNote(meta.slots).split('—')[1]?.trim() ?? ''}`,
    )
    setSyncing(null)
  }

  if (compact && channels.length === 1) {
    const channel = channels[0]
    const meta = SYNC_CHANNEL_META[channel]
    const active = activeDataSnapshotSlot(meta.slots)
    return (
      <div className={cx('liquid-glass flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between', className)}>
        <div className="space-y-1">
          <p className="text-xs font-black uppercase tracking-wider text-theme-muted">Sync schedule</p>
          <p className="text-sm font-bold text-theme-primary">{meta.description}</p>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-theme-secondary">
            <Clock size={12} /> Active snapshot: {active.label} · Now: {formatIstNow()}
          </p>
          <SlotPills slots={meta.slots} activeLabel={active.label} />
        </div>
        <button
          type="button"
          onClick={() => handleSync(channel)}
          disabled={syncing === channel}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-5 text-sm font-bold text-[#0f1d35] shadow-sm"
          style={{ background: 'var(--fb-yellow)' }}
        >
          <RefreshCw size={16} className={syncing === channel ? 'animate-spin' : ''} />
          Sync {meta.title}
        </button>
        {message ? <p className="text-xs font-semibold text-theme-secondary sm:col-span-2">{message}</p> : null}
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
            Manual sync queues the next scrape window. App stores run once daily at 08:00 IST; marketplaces and SRP run 4× daily.
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
          return (
            <article key={channel} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
              <h3 className="font-extrabold text-theme-primary">{meta.title}</h3>
              <p className="mt-1 text-sm font-semibold text-theme-secondary">{meta.description}</p>
              <div className="mt-3 space-y-2 text-xs font-semibold text-theme-muted">
                <p>Active snapshot: {active.label}</p>
                <p>{meta.oncePerDay ? 'One row per calendar day' : 'Four rows per calendar day'}</p>
                <SlotPills slots={meta.slots} activeLabel={active.label} />
              </div>
              <button
                type="button"
                onClick={() => handleSync(channel)}
                disabled={syncing === channel}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--fb-blue)] text-sm font-bold text-white"
              >
                <RefreshCw size={15} className={syncing === channel ? 'animate-spin' : ''} />
                Sync now
              </button>
            </article>
          )
        })}
      </div>
      {message ? <p className="visual-body border-t border-[var(--border-subtle)] pt-3 text-sm font-semibold text-theme-secondary">{message}</p> : null}
    </section>
  )
}
