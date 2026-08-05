import React, { useMemo, useState } from 'react'
import {
  Bus,
  Calendar,
  ChevronDown,
  Compass,
  Filter,
  MapPin,
  Play,
  Star
} from 'lucide-react'
import { useRedbusSrp } from '../api'
import SectionHeader from '../components/SectionHeader'
import { cx } from '../lib/insights'

// Helper to generate dates between start and end
function getDatesInRange(startStr: string, endStr: string): string[] {
  if (!startStr || !endStr) return []
  const start = new Date(startStr)
  const end = new Date(endStr)
  const dates: string[] = []
  
  const current = new Date(start)
  // Limit to max 31 days to keep grid clean and prevent browser lag
  let safetyCounter = 0
  while (current <= end && safetyCounter < 31) {
    const yyyy = current.getFullYear()
    const mm = String(current.getMonth() + 1).padStart(2, '0')
    const dd = String(current.getDate()).padStart(2, '0')
    dates.push(`${yyyy}-${mm}-${dd}`)
    current.setDate(current.getDate() + 1)
    safetyCounter++
  }
  return dates
}

// Helper to format date for column headers (e.g. 2026-08-04 -> 8/4/2026)
function formatHeaderDate(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)
  const year = parts[0]
  return `${month}/${day}/${year}`
}

export default function RedbusSrpPage() {
  // Input Form States
  const [operator, setOperator] = useState<string>('FRESHBUS')
  const [route, setRoute] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // Submitted States (used for rendering data once "Go" is clicked)
  const [submitted, setSubmitted] = useState({
    operator: 'FRESHBUS',
    route: '',
    startDate: '',
    endDate: ''
  })
  const [showTable, setShowTable] = useState(false)

  // Fetch metadata lists (routes & operators) by loading with empty values
  const { data: metaData } = useRedbusSrp('', '')
  const routesList = metaData?.routes ?? []

  // Fetch actual data using submitted filters (only triggers when Go is clicked)
  const { data: srpResponse, isLoading } = useRedbusSrp(
    submitted.operator,
    submitted.route || undefined
  )

  const items = srpResponse?.data ?? []

  // Calculate selected date range columns
  const activeDates = useMemo(() => {
    if (!submitted.startDate || !submitted.endDate) return []
    return getDatesInRange(submitted.startDate, submitted.endDate)
  }, [submitted.startDate, submitted.endDate])

  // Is Go button disabled?
  const isGoDisabled = !operator || !route || !startDate || !endDate

  const handleGo = (e: React.FormEvent) => {
    e.preventDefault()
    if (isGoDisabled) return
    setSubmitted({ operator, route, startDate, endDate })
    setShowTable(true)
  }

  // Get color tone based on ranking value
  function getRankToneClass(rank: number) {
    if (rank <= 10) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
    if (rank <= 30) return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    if (rank <= 100) return 'bg-amber-500/10 text-amber-500 border-amber-500/20'
    return 'bg-rose-500/10 text-rose-500 border-rose-500/20'
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--neon-blue)]">
          Redbus Search Visibility
        </span>
        <h1 className="text-3xl font-black tracking-tight text-theme-primary">
          SRP Rankings
        </h1>
        <p className="mt-1 text-sm text-theme-muted">
          Compare search result position rankings for operators across specific routes and dates.
        </p>
      </div>

      {/* Inputs Section */}
      <form onSubmit={handleGo} className="glass-panel p-4 md:p-6 rounded-2xl border border-[var(--border-subtle)] space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
          <Filter size={16} className="text-[var(--neon-blue)]" />
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-theme-primary">
            Filter Parameters
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Operator Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-theme-secondary">Select Operator</label>
            <div className="relative">
              <Bus className="absolute left-3.5 top-1/2 -translate-y-1/2 text-theme-muted" size={16} />
              <select
                className="w-full h-11 appearance-none rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-10 pr-10 text-sm font-extrabold text-theme-primary outline-none transition focus:border-[var(--border-glow)]"
                value={operator}
                onChange={e => setOperator(e.target.value)}
              >
                <option value="FRESHBUS">FRESHBUS</option>
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-theme-muted" size={16} />
            </div>
          </div>

          {/* Route Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-theme-secondary">Select Route</label>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-theme-muted" size={16} />
              <select
                className="w-full h-11 appearance-none rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-10 pr-10 text-sm font-extrabold text-theme-primary outline-none transition focus:border-[var(--border-glow)]"
                value={route}
                onChange={e => setRoute(e.target.value)}
              >
                <option value="">-- Choose Route --</option>
                {routesList.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-theme-muted" size={16} />
            </div>
          </div>

          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-theme-secondary">Start Date</label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-theme-muted" size={16} />
              <input
                type="date"
                className="w-full h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-10 pr-4 text-sm font-extrabold text-theme-primary outline-none transition focus:border-[var(--border-glow)]"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
          </div>

          {/* End Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-theme-secondary">End Date</label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-theme-muted" size={16} />
              <input
                type="date"
                className="w-full h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-10 pr-4 text-sm font-extrabold text-theme-primary outline-none transition focus:border-[var(--border-glow)]"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Go Submit Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isGoDisabled}
            className={cx(
              "flex h-11 items-center gap-2 rounded-xl px-8 text-sm font-black text-white shadow-lg transition-all",
              isGoDisabled
                ? "bg-slate-400/20 text-slate-500 border border-[var(--border-subtle)] cursor-not-allowed shadow-none"
                : "bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 active:scale-95"
            )}
          >
            <Play size={14} fill="currentColor" />
            Go
          </button>
        </div>
      </form>

      {/* Main Grid/Table View (Only visible once submitted) */}
      {showTable && (
        <div className="glass-panel rounded-2xl border border-[var(--border-subtle)] overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-[var(--border-subtle)] bg-[var(--header-bg)] p-6 sm:flex-row sm:items-center sm:justify-between">
            <SectionHeader
              eyebrow="Redbus SRP"
              title={`SRP Placements for ${submitted.operator}`}
              subtitle={`${submitted.route} | Date Range: ${formatHeaderDate(submitted.startDate)} to ${formatHeaderDate(submitted.endDate)}`}
            />
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-center text-sm font-semibold text-theme-muted">
                Loading SRP rankings...
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-sm font-semibold text-theme-muted">
                No matching service records found in the database.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-semibold text-theme-secondary border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-slate-500/5 text-theme-primary uppercase tracking-wider text-[10px]">
                    <th className="p-4 font-black">Route</th>
                    <th className="p-4 font-black">Timing</th>
                    
                    {/* Render dynamic columns for each selected date in range */}
                    {activeDates.map(date => (
                      <th key={date} className="p-4 font-black border-l border-[var(--border-subtle)] bg-violet-500/5 text-center text-theme-primary">
                        {formatHeaderDate(date)}
                      </th>
                    ))}
                    
                    <th className="p-4 font-black border-l border-[var(--border-subtle)] text-amber-500">Rating</th>
                    <th className="p-4 font-black">Reviews</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {items.map(item => (
                    <tr key={item.service_key} className="hover:bg-slate-500/5 transition">
                      <td className="p-4 font-extrabold text-theme-primary whitespace-nowrap">{item.route}</td>
                      <td className="p-4 whitespace-nowrap font-bold text-theme-primary">{item.timing}</td>
                      
                      {/* Render dynamic rank data matching header dates */}
                      {activeDates.map(date => {
                        // Date key format in JSON mapping is d_08_04, d_08_05 etc.
                        const dateParts = date.split('-')
                        const monthNum = dateParts[1]  // e.g. "08"
                        const dayNum = dateParts[2]    // e.g. "05"
                        const dayKey = `d_${monthNum}_${dayNum}`
                        const rankVal = (item as any)[dayKey]
                        
                        return (
                          <td key={date} className="p-4 border-l border-[var(--border-subtle)] bg-violet-500/5 text-center font-bold">
                            {rankVal ? (
                              <span className={cx("px-2 py-1 rounded-md text-[11px] border font-bold", getRankToneClass(rankVal))}>
                                {rankVal}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">-</span>
                            )}
                          </td>
                        )
                      })}

                      {/* Stats */}
                      <td className="p-4 border-l border-[var(--border-subtle)] font-bold text-theme-primary whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-amber-500">
                          <Star size={13} fill="currentColor" />
                          {(() => { const r = parseFloat(item.rating); return (isNaN(r) || r > 5) ? '—' : r.toFixed(1) })()}

                        </div>
                      </td>
                      <td className="p-4 text-theme-muted font-bold">{item.reviews}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
