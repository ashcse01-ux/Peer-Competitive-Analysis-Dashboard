import React, { useMemo, useState } from 'react'
import {
  Bus,
  Calendar,
  ChevronDown,
  MapPin,
  Play,
  Star
} from 'lucide-react'
import { useRedbusSrp } from '../api'
import SectionHeader from '../components/SectionHeader'
import { cx } from '../lib/insights'
import { FB_BLUE, FB_YELLOW } from '../lib/playTopics'
import { canonicalSrpRouteOptions } from '../lib/redbusRoutes'

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
  const routesList = useMemo(
    () => canonicalSrpRouteOptions(metaData?.routes ?? []),
    [metaData?.routes],
  )

  // Fetch actual data using submitted filters (only triggers when Go is clicked)
  const { data: srpResponse, isLoading } = useRedbusSrp(
    submitted.operator,
    submitted.route || undefined
  )

  const rawItems = srpResponse?.data ?? []
  const items = useMemo(() => {
    if (!submitted.route) return rawItems
    // Match route name exactly or handle unicode arrow character formats
    const cleanSubmitted = submitted.route.replace('→', '→').trim().toLowerCase()
    return rawItems.filter(item => {
      const cleanItemRoute = item.route.replace('→', '→').trim().toLowerCase()
      return cleanItemRoute === cleanSubmitted
    })
  }, [rawItems, submitted.route])

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
    <div className="page-section">
      <SectionHeader
        variant="hero"
        divider={false}
        eyebrow="Redbus · Search visibility"
        title="SRP rankings"
        subtitle="Compare search result position rankings for operators across specific routes and dates."
      />

      <form onSubmit={handleGo} className="liquid-glass chart-panel panel-shell space-y-4">
        <SectionHeader eyebrow="Filters" title="Filter parameters" subtitle="Choose operator, route, and date range, then run the query." />
        <div className="visual-body space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <option value="">Choose route</option>
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

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isGoDisabled}
              className={cx(
                'flex h-11 items-center gap-2 rounded-xl px-8 text-sm font-bold text-white shadow-md transition-all',
                isGoDisabled
                  ? 'cursor-not-allowed border border-[var(--border-subtle)] bg-slate-400/20 text-slate-500 shadow-none'
                  : 'hover:opacity-95 active:scale-[0.98]',
              )}
              style={isGoDisabled ? undefined : { backgroundColor: FB_BLUE }}
            >
              <Play size={14} fill="currentColor" />
              Go
            </button>
          </div>
        </div>
      </form>

      {showTable && (
        <div className="liquid-glass chart-panel panel-shell overflow-hidden">
          <div className="border-b border-[var(--border-subtle)] p-4 sm:p-6">
            <SectionHeader
              eyebrow="Redbus SRP"
              title={`SRP placements for ${submitted.operator}`}
              subtitle={`${submitted.route} · ${formatHeaderDate(submitted.startDate)} – ${formatHeaderDate(submitted.endDate)}`}
            />
          </div>

          <div className="visual-body overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-center text-sm font-semibold text-theme-muted">
                Loading SRP rankings...
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-sm font-semibold text-theme-muted">
                No matching service records found in the database.
              </div>
            ) : (
              <table className="data-table min-w-[720px]">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Timing</th>
                    {activeDates.map(date => (
                      <th key={date} className="text-center border-l border-[var(--border-subtle)]">
                        {formatHeaderDate(date)}
                      </th>
                    ))}
                    <th className="border-l border-[var(--border-subtle)]">Rating</th>
                    <th>Reviews</th>
                    <th className="border-l border-[var(--border-subtle)]">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.service_key}>
                      <td className="font-bold whitespace-nowrap">
                        {item.route} {item.bus_type ? `(${item.bus_type})` : ''}
                      </td>
                      <td className="whitespace-nowrap font-semibold">
                        {item.timing} {(() => {
                          const dur = item.duration && item.duration.trim() ? item.duration : (() => {
                            const parts = item.timing.split('-').map(s => s.trim());
                            if (parts.length !== 2) return '';
                            const parseTime = (tStr: string) => {
                              const [h, m] = tStr.split(':').map(Number);
                              return { h: isNaN(h) ? 0 : h, m: isNaN(m) ? 0 : m };
                            };
                            const dep = parseTime(parts[0]);
                            const arr = parseTime(parts[1]);
                            let diff = (arr.h * 60 + arr.m) - (dep.h * 60 + dep.m);
                            if (diff < 0) diff += 24 * 60;
                            const diffH = Math.floor(diff / 60);
                            const diffM = diff % 60;
                            return `${String(diffH).padStart(2, '0')}:${String(diffM).padStart(2, '0')}`;
                          })();
                          return dur ? `(${dur})` : '';
                        })()}
                      </td>
                      
                      {/* Render dynamic rank data matching header dates */}
                      {activeDates.map(date => {
                        // Date key format in JSON mapping is d_08_04, d_08_05 etc.
                        const dateParts = date.split('-')
                        const monthNum = dateParts[1]  // e.g. "08"
                        const dayNum = dateParts[2]    // e.g. "05"
                        const dayKey = `d_${monthNum}_${dayNum}`
                        const rankVal = (item as any)[dayKey]
                        
                        return (
                          <td key={date} className="border-l border-[var(--border-subtle)] text-center font-semibold">
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
                      <td className="border-l border-[var(--border-subtle)] font-semibold whitespace-nowrap">
                        <div className="flex items-center gap-1.5" style={{ color: FB_YELLOW }}>
                          <Star size={13} fill="currentColor" />
                          {(() => { const r = parseFloat(item.rating); return (isNaN(r) || r > 5) ? '—' : r.toFixed(1) })()}

                        </div>
                      </td>
                      <td className="text-theme-muted font-semibold">{item.reviews}</td>
                      <td className="border-l border-[var(--border-subtle)] font-bold text-theme-primary whitespace-nowrap">
                        {item.price ? item.price : '—'}
                      </td>
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
