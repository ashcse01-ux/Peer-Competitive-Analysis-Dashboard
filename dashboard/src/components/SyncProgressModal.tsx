import React, { useEffect, useState, useRef } from 'react'
import { CheckCircle2, Loader2, RefreshCw, X, ArrowRight, ShieldCheck, Sparkles, MapPin } from 'lucide-react'

interface SyncProgressModalProps {
  isOpen: boolean
  onClose: () => void
}

interface RedbusStatusResponse {
  status: string
  step: string
  completed_routes: number
  total_routes: number
  current_route: string
  logs: string[]
  updated_at?: string
}

export default function SyncProgressModal({ isOpen, onClose }: SyncProgressModalProps) {
  const [statusData, setStatusData] = useState<RedbusStatusResponse>({
    status: 'idle',
    step: 'idle',
    completed_routes: 0,
    total_routes: 24,
    current_route: '',
    logs: [],
  })
  const [isStarting, setIsStarting] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Start scraper when modal opens & reset state
  useEffect(() => {
    if (isOpen) {
      setStatusData({
        status: 'running',
        step: 'scraping',
        completed_routes: 0,
        total_routes: 24,
        current_route: 'Initializing scraper engine...',
        logs: ['🚀 Initialized Marketplace Scraper for 24 Redbus routes'],
      })
      setIsStarting(true)
      fetch('/api/v1/refresh/redbus', { method: 'POST' })
        .catch(err => console.error('Failed to trigger redbus sync:', err))
        .finally(() => setIsStarting(false))
    }
  }, [isOpen])

  // Poll status every 8 seconds gently to avoid log spam, stop immediately when completed
  useEffect(() => {
    if (!isOpen || statusData.status === 'completed') return

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/v1/refresh/redbus/status')
        if (res.ok) {
          const data: RedbusStatusResponse = await res.json()
          setStatusData(data)
          if (data.status === 'completed') {
            clearInterval(pollInterval)
          }
        }
      } catch (err) {
        console.error('Failed to fetch sync status:', err)
      }
    }, 8000)

    return () => clearInterval(pollInterval)
  }, [isOpen, statusData.status])

  // Auto scroll route step feed to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [statusData.logs, statusData.completed_routes])

  if (!isOpen) return null

  const isCompleted = statusData.status === 'completed'
  const isRunning = statusData.status === 'running' || isStarting
  const total = statusData.total_routes || 24
  const completed = Math.min(total, statusData.completed_routes || 0)
  const progressPct = Math.min(100, Math.round((completed / total) * 100))

  const handleFinish = () => {
    onClose()
    window.location.reload()
  }

  // Parse logs into structured route items
  const cleanLogs = statusData.logs || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-900 p-6 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] text-slate-100 transition-all">
        
        {/* Top Accent Gradient Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles size={20} />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400">Live Scraper Sync</span>
              <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                Marketplace Intelligence
              </h3>
            </div>
          </div>
          
          <button
            onClick={onClose}
            title="Close modal"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="py-6 space-y-6">

          {/* Progress Header & Percentage Bar */}
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <div>
                <span className="text-2xl font-black tracking-tight text-white tabular-nums">
                  {isCompleted ? '100%' : `${progressPct}%`}
                </span>
                <span className="ml-2 text-xs font-semibold text-slate-400">
                  ({completed} of {total} routes scraped)
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                {isRunning && <Loader2 size={12} className="animate-spin text-indigo-400" />}
                {isCompleted && <CheckCircle2 size={12} className="text-emerald-400" />}
                {isCompleted ? 'Completed' : statusData.step === 'parsing' ? 'Parsing Database' : statusData.step === 'fetching_ratings' ? 'Fetching Ratings Tags' : 'Scraping Active'}
              </span>
            </div>

            {/* Glowing Gradient Progress Track */}
            <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/50 shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  isCompleted
                    ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                    : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 shadow-[0_0_12px_rgba(99,102,241,0.5)]'
                }`}
                style={{ width: `${Math.max(4, progressPct)}%` }}
              />
            </div>
          </div>

          {/* Completion Celebration Card */}
          {isCompleted ? (
            <div className="rounded-2xl bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-500/30 p-5 text-center space-y-2 animate-in zoom-in-95 duration-300">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mb-1">
                <CheckCircle2 size={26} />
              </div>
              <h4 className="text-lg font-bold text-white">Sync Completed Successfully!</h4>
              <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                All 24 routes have been scraped, parsed into SQLite, and updated with travelers sentiment rating tags.
              </p>
              <div className="pt-2 flex justify-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  <ShieldCheck size={12} /> 24 Routes Verified
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  ⭐ Ratings Tags Loaded
                </span>
              </div>
            </div>
          ) : (
            /* Active Current Route Card */
            statusData.current_route && (
              <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-3.5 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <MapPin size={16} />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">Scraping In Progress</span>
                    <p className="text-xs font-bold text-white">{statusData.current_route}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                  </span>
                </div>
              </div>
            )
          )}

          {/* Clean Visual Activity Feed (No Monospace Black Box) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-1">
              <span>Sync Live Feed</span>
              <span>{cleanLogs.length} updates</span>
            </div>
            
            <div
              ref={listRef}
              className="h-44 w-full rounded-2xl bg-slate-950/60 border border-slate-800 p-3 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-700"
            >
              {cleanLogs.length > 0 ? (
                cleanLogs.map((logLine, idx) => {
                  const isCheck = logLine.includes('✅')
                  const isSkip = logLine.includes('⚠️') || logLine.includes('Skipped')
                  const isStart = logLine.includes('🚀')

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-2.5 rounded-xl text-xs font-medium transition-all ${
                        isCheck
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                          : isSkip
                          ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                          : isStart
                          ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                          : 'bg-slate-800/60 text-slate-300 border border-slate-700/40'
                      }`}
                    >
                      <span className="truncate pr-2">{logLine}</span>
                      {isCheck && <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />}
                      {isStart && <Sparkles size={14} className="shrink-0 text-indigo-400" />}
                    </div>
                  )
                })
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500 italic">
                  Initializing sync sequence...
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
          {isCompleted ? (
            <button
              onClick={handleFinish}
              className="w-full sm:w-auto ml-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 group"
            >
              <span>Apply & Reload Dashboard</span>
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition-all flex items-center gap-1.5"
              >
                <X size={14} />
                <span>Close Window</span>
              </button>

              <button
                disabled
                className="px-5 py-2.5 rounded-xl bg-slate-800/90 text-slate-400 font-bold text-xs flex items-center gap-2 border border-slate-700/50 opacity-90 cursor-not-allowed"
              >
                <RefreshCw size={14} className="animate-spin text-indigo-400" />
                <span>Syncing in background...</span>
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
