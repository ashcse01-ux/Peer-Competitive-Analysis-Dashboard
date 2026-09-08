import React, { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { addDaysIso, todayIso } from '../lib/periodPresets'
import { cx } from '../lib/insights'
import SyncProgressModal from './SyncProgressModal'
import { fetch as apiFetch, type RedbusSrpSyncStatus } from '../api'
import { useMarketplaceFilters } from '../context/MarketplaceFilterContext'

function formatScrapedAt(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return raw
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[Number(m[2]) - 1] ?? m[2]
  return `${Number(m[3])} ${month} ${m[1]} · ${m[4]}:${m[5]}`
}

export default function RedbusGlobalHeader() {
  const [modalOpen, setModalOpen] = useState(false)
  const status = syncStatusLine()
  const queryClient = useQueryClient()
  const filters = useMarketplaceFilters()
  const [job, setJob] = useState<RedbusSrpSyncStatus | null>(null)
  const [dbLastScraped, setDbLastScraped] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  const syncing = job?.status === 'running'
  const syncError = job?.status === 'error'
  const percent = Math.max(0, Math.min(100, job?.percent ?? 0))

  const travelDateIso =
    filters.period === 'custom'
      ? filters.customEnd || filters.customStart || addDaysIso(todayIso(), 1)
      : filters.periodRange.endDate || addDaysIso(todayIso(), 1)

  const loadMeta = async () => {
    try {
      const meta = await apiFetch.redbusSrpMeta()
      setDbLastScraped(meta.last_scraped_at ?? null)
    } catch {
      /* ignore */
    }
  }

  const stopPoll = () => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const refreshDashboard = async () => {
    await queryClient.invalidateQueries({ queryKey: ['redbus-srp'] })
    await queryClient.refetchQueries({ queryKey: ['redbus-srp'] })
    await loadMeta()
  }

  const pollStatus = async () => {
    try {
      const status = await apiFetch.redbusSrpSyncStatus()
      setJob(status)
      if (status.status === 'completed') {
        stopPoll()
        await refreshDashboard()
      } else if (status.status === 'error' || status.status === 'idle') {
        stopPoll()
      }
    } catch {
      /* keep polling while UI thinks we're syncing */
    }
  }

  useEffect(() => {
    void loadMeta()
    void apiFetch.redbusSrpSyncStatus().then(s => {
      setJob(s)
      if (s.status === 'running') {
        pollRef.current = window.setInterval(() => void pollStatus(), 1500)
      }
    }).catch(() => {})
    return stopPoll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSyncClick = () => {
    setModalOpen(true)
  }

  const lastScrapedLabel = formatScrapedAt(job?.last_scraped_at || dbLastScraped) ?? '—'

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
