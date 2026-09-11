import React, { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { syncStatusLine } from '../lib/periodPresets'
import { cx } from '../lib/insights'
import SyncProgressModal from './SyncProgressModal'
import { fetch as apiFetch, type RedbusSrpSyncStatus } from '../api'

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
  const [job, setJob] = useState<RedbusSrpSyncStatus | null>(null)
  const [dbLastScraped, setDbLastScraped] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

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
      const next = await apiFetch.redbusSrpSyncStatus()
      setJob(next)
      if (next.status === 'completed') {
        stopPoll()
        await refreshDashboard()
      } else if (next.status === 'error' || next.status === 'idle') {
        stopPoll()
      }
    } catch {
      /* keep polling */
    }
  }

  useEffect(() => {
    void loadMeta()
    void apiFetch
      .redbusSrpSyncStatus()
      .then(s => {
        setJob(s)
        if (s.status === 'running') {
          pollRef.current = window.setInterval(() => void pollStatus(), 1500)
        }
      })
      .catch(() => {})
    return stopPoll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lastScrapedLabel = formatScrapedAt(job?.last_scraped_at || dbLastScraped)
  const syncing = job?.status === 'running'

  return (
    <>
      <header className="rb-stage rb-stage--head">
        <div className="rb-stage__glow" aria-hidden />
        <div className="rb-stage-head">
          <div className="rb-stage-head__copy">
            <div className="rb-stage-title-row">
              <h1 className="rb-stage-title">Red Bus Analytics</h1>
              <span className="rb-stage-live">
                <span className="rb-stage-live__dot" aria-hidden />
                Live
              </span>
            </div>
            <div className="rb-stage-status" aria-label="Data freshness">
              <span className="rb-stage-status__pair">
                <span className="rb-stage-status__label">Last scraped</span>
                <span className="rb-stage-status__value">{status.lastScraped} IST</span>
              </span>
              <span className="rb-stage-status__sep" aria-hidden />
              <span className="rb-stage-status__pair">
                <span className="rb-stage-status__label">Latest snapshot</span>
                <span className="rb-stage-status__value">{lastScrapedLabel ?? status.latestSnapshot}</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            title="Start real-time scraper & ratings sync"
            className={cx('rb-stage-sync', syncing && 'rb-stage-sync--busy')}
          >
            <RefreshCw size={15} strokeWidth={2.4} className={syncing ? 'rb-stage-sync__spin' : undefined} />
            <span>{syncing ? 'Syncing…' : 'Sync'}</span>
          </button>
        </div>
      </header>

      <SyncProgressModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}
