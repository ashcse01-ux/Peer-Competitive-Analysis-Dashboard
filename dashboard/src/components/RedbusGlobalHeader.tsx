import React, { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { syncStatusLine } from '../lib/periodPresets'
import { cx } from '../lib/insights'
import SyncProgressModal from './SyncProgressModal'

export default function RedbusGlobalHeader() {
  const [modalOpen, setModalOpen] = useState(false)
  const status = syncStatusLine()

  const handleSyncClick = () => {
    setModalOpen(true)
  }

  return (
    <>
      <header className="redbus-global-header mb-4 flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-theme-muted">Red Bus Analytics</p>
          <h1 className="text-xl font-extrabold tracking-tight text-theme-primary sm:text-2xl">Marketplace intelligence</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs font-semibold text-theme-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
              Current
            </span>
            <span>
              Last scraped: <strong className="text-theme-primary">{status.lastScraped} IST</strong>
            </span>
            <span>
              Latest snapshot: <strong className="text-theme-primary">{status.latestSnapshot}</strong>
            </span>
            <span>
              Next expected: <strong className="text-[var(--fb-blue)]">{status.nextExpected} IST</strong>
            </span>
          </div>
          <p className="text-[0.65rem] font-semibold text-theme-muted">
            Data available from {status.dataAvailableFrom}
          </p>
        </div>

        <button
          type="button"
          onClick={handleSyncClick}
          title="Click to start real-time scraper & ratings sync"
          className={cx(
            'inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-xl px-5 text-sm font-extrabold text-[#0f1d35] shadow-sm hover:opacity-90 active:scale-95 transition-all'
          )}
          style={{ background: 'var(--fb-yellow)' }}
        >
          <RefreshCw size={16} />
          Sync
        </button>
      </header>

      <SyncProgressModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}
