import React, { useState } from 'react'
import { Clock, RefreshCw } from 'lucide-react'
import {
  MARKETPLACE_SYNC_SLOTS,
  activeDataSnapshotSlot,
  formatIstNow,
  nextSyncSlot,
  type SyncChannel,
} from '../lib/syncSchedules'
import { syncStatusLine } from '../lib/periodPresets'
import { cx } from '../lib/insights'

interface Props {
  marketplaceLabel: string
  kpiChannel: SyncChannel
  srpChannel: SyncChannel
  accent?: string
}

export default function MarketplaceChannelSyncBar({
  marketplaceLabel,
  accent = 'var(--fb-blue)',
}: Props) {
  const [syncing, setSyncing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)

  const status = syncStatusLine()
  const activeSlot = activeDataSnapshotSlot(MARKETPLACE_SYNC_SLOTS)
  const nextSlot = nextSyncSlot(MARKETPLACE_SYNC_SLOTS)

  const handleSync = async () => {
    setSyncing(true)
    await new Promise(r => setTimeout(r, 900))
    setLastSyncAt(new Date())
    setSyncing(false)
  }

  return (
    <header
      className="mb-4 flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 p-4 sm:flex-row sm:items-center sm:justify-between"
      style={{ borderColor: `${accent}22` }}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-extrabold uppercase tracking-wide text-theme-primary">{marketplaceLabel} Analytics</h2>
          <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[0.6rem] font-black uppercase text-theme-muted">
            Sync loads stored snapshots — never triggers scrape
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-theme-secondary">
          <span>Last scraped: <strong className="text-theme-primary">{status.lastScraped}</strong> IST</span>
          <span>Latest snapshot: <strong className="text-theme-primary">{status.latestSnapshot}</strong> IST</span>
          <span>Next expected: <strong style={{ color: accent }}>{status.nextExpected}</strong> IST</span>
          <span className="inline-flex items-center gap-1 text-theme-muted">
            <Clock size={11} /> {formatIstNow()}
            {lastSyncAt ? ` · Refreshed ${formatIstNow(lastSyncAt)}` : null}
          </span>
        </div>
        <p className="text-[0.65rem] font-semibold text-theme-muted">
          Active window: {activeSlot.label} · Next pipeline: {nextSlot.label}
        </p>
      </div>

      <button
        type="button"
        onClick={handleSync}
        disabled={syncing}
        className={cx(
          'inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-6 text-sm font-extrabold text-[#0f1d35] shadow-sm',
          syncing && 'opacity-70',
        )}
        style={{ background: 'var(--fb-yellow)' }}
      >
        <RefreshCw size={17} className={syncing ? 'animate-spin' : ''} />
        Sync
      </button>
    </header>
  )
}
