import React, { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { addDaysIso, todayIso } from '../lib/periodPresets'
import { cx } from '../lib/insights'
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

  const handleSync = async () => {
    stopPoll()
    setJob({
      status: 'running',
      percent: 0,
      phase: 'starting',
      current: 0,
      total: 0,
      route_label: '',
      message: 'Starting scrape…',
      travel_date: null,
      travel_date_iso: travelDateIso,
      error: null,
      started_at: null,
      finished_at: null,
      last_scraped_at: null,
    })
    try {
      const res = await apiFetch.triggerRedbusSrpSync(travelDateIso)
      setJob(res.job)
      pollRef.current = window.setInterval(() => void pollStatus(), 1500)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setJob(prev => ({
        ...(prev ?? {
          status: 'error',
          percent: 0,
          phase: 'error',
          current: 0,
          total: 0,
          route_label: '',
          message: '',
          travel_date: null,
          travel_date_iso: travelDateIso,
          error: null,
          started_at: null,
          finished_at: null,
          last_scraped_at: null,
        }),
        status: 'error',
        message: typeof detail === 'string' ? detail : 'Unable to start sync',
        error: typeof detail === 'string' ? detail : 'Unable to start sync',
      }))
    }
  }

  const lastScrapedLabel = formatScrapedAt(job?.last_scraped_at || dbLastScraped) ?? '—'

  return (
    <header className="redbus-global-header mb-4 flex flex-col gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-theme-muted">Red Bus Analytics</p>
          <h1 className="text-xl font-extrabold tracking-tight text-theme-primary sm:text-2xl">SRP Tracker</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs font-semibold text-theme-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cx(
                  'inline-block h-2 w-2 rounded-full',
                  syncError ? 'bg-red-500' : syncing ? 'bg-[var(--fb-yellow)]' : 'bg-emerald-500',
                )}
                aria-hidden
              />
              {syncing ? 'Scraping' : syncError ? 'Sync failed' : 'Ready'}
            </span>
            <span>
              Travel day: <strong className="text-theme-primary">{travelDateIso}</strong>
            </span>
            <span>
              Last scraped: <strong className="text-theme-primary">{lastScrapedLabel}</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            title="Starts a live Redbus scrape and replaces that travel day's SRP data."
            className={cx(
              'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-5 text-sm font-extrabold text-[#0f1d35] shadow-sm',
              syncing && 'opacity-70',
            )}
            style={{ background: 'var(--fb-yellow)' }}
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>

      {(syncing || job?.status === 'completed' || syncError) && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-xs font-bold text-theme-secondary">
            <span className="truncate">{job?.message || (syncing ? 'Scraping…' : '')}</span>
            <span className="shrink-0 tabular-nums text-theme-primary">{percent}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--border-subtle)]">
            <div
              className={cx(
                'h-full rounded-full transition-[width] duration-500 ease-out',
                syncError ? 'bg-red-500' : 'bg-[var(--fb-blue)]',
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          {syncing && job?.total ? (
            <p className="text-[0.65rem] font-semibold text-theme-muted">
              Route {job.current}/{job.total}
              {job.route_label ? ` · ${job.route_label}` : ''}
            </p>
          ) : null}
        </div>
      )}
    </header>
  )
}
