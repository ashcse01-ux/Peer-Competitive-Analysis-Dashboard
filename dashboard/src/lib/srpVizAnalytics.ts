/**
 * SRP Tracker visualization aggregations — correct stats for filtered RedbusSrpEntry rows.
 */
import type { RedbusSrpEntry } from '../api'
import { addDaysIso } from './periodPresets'
import { displayOperatorName, isFreshBus } from './marketplaceConfig'

export type TemporalGrain = 'day' | 'week' | 'month'

export interface SrpObservation {
  serviceKey: number
  route: string
  operator: string
  operatorDisplay: string
  timing: string
  departureHour: number | null
  date: string
  rank: number
  price: number | null
  occupancy: number | null
  rating: number | null
  reviews: number | null
  busType: string
}

export interface SrpKpis {
  totalServices: number
  medianPrice: number | null
  avgOccupancy: number | null
  occupancyLabel: 'Average observed occupancy'
  weightedRating: number | null
  top10Visibility: number | null
  activeOperators: number
}

export interface KpiDelta {
  value: number | null
  kind: 'pct' | 'pp' | 'abs' | 'none'
}

const HOUR_BUCKETS = [
  { id: '00-03', label: '00–03', start: 0, end: 3 },
  { id: '03-06', label: '03–06', start: 3, end: 6 },
  { id: '06-09', label: '06–09', start: 6, end: 9 },
  { id: '09-12', label: '09–12', start: 9, end: 12 },
  { id: '12-15', label: '12–15', start: 12, end: 15 },
  { id: '15-18', label: '15–18', start: 15, end: 18 },
  { id: '18-21', label: '18–21', start: 18, end: 21 },
  { id: '21-24', label: '21–24', start: 21, end: 24 },
] as const

export const SRP_RANK_BANDS = [
  { id: 'top5', label: 'Top 5', test: (r: number) => r <= 5 },
  { id: '6-10', label: '6–10', test: (r: number) => r >= 6 && r <= 10 },
  { id: '11-20', label: '11–20', test: (r: number) => r >= 11 && r <= 20 },
  { id: '21-50', label: '21–50', test: (r: number) => r >= 21 && r <= 50 },
  { id: '51+', label: '51+', test: (r: number) => r >= 51 },
] as const

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null
  const n = Number(String(raw).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : null
}

function parseRating(raw: string | null | undefined): number | null {
  const n = parseFloat(String(raw ?? ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseReviews(raw: string | null | undefined): number | null {
  const n = Number(String(raw ?? '').replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : null
}

function occupancyFromRow(row: RedbusSrpEntry): number | null {
  if (row.seat_capacity != null && row.seats_available != null) {
    const cap = Number(row.seat_capacity)
    const avail = Number(row.seats_available)
    if (Number.isFinite(cap) && cap > 0 && Number.isFinite(avail)) {
      return Math.min(100, Math.max(0, ((cap - avail) / cap) * 100))
    }
  }
  if (row.occupancy_pct != null && Number.isFinite(Number(row.occupancy_pct))) {
    return Number(row.occupancy_pct)
  }
  return null
}

function departureHour(timing: string | null | undefined): number | null {
  if (!timing) return null
  const first = String(timing).split('-')[0]?.trim() ?? ''
  const m = first.match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  return Number.isFinite(h) ? h : null
}

export function dayDiffInclusive(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00`)
  const b = new Date(`${end}T12:00:00`)
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1)
}

export function previousPeriodRange(start: string, end: string) {
  const days = dayDiffInclusive(start, end)
  return {
    startDate: addDaysIso(start, -days),
    endDate: addDaysIso(start, -1),
  }
}

export function pickTemporalGrain(start: string, end: string): TemporalGrain {
  const days = dayDiffInclusive(start, end)
  if (days <= 14) return 'day'
  if (days <= 90) return 'week'
  return 'month'
}

export function enumerateDates(start: string, end: string): string[] {
  if (!start || !end || start > end) return []
  const out: string[] = []
  let cur = start
  let guard = 0
  while (cur <= end && guard < 400) {
    out.push(cur)
    cur = addDaysIso(cur, 1)
    guard += 1
  }
  return out
}

function isoWeekKey(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day + 3)
  const week1 = new Date(d.getFullYear(), 0, 4)
  const week =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    )
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function periodKey(iso: string, grain: TemporalGrain): string {
  if (grain === 'day') return iso
  if (grain === 'month') return iso.slice(0, 7)
  return isoWeekKey(iso)
}

export function formatPeriodLabel(key: string, grain: TemporalGrain): string {
  if (grain === 'day') {
    const [y, m, d] = key.split('-').map(Number)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${d} ${months[(m ?? 1) - 1]}`
  }
  if (grain === 'month') {
    const [y, m] = key.split('-').map(Number)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[(m ?? 1) - 1]} ${y}`
  }
  return key.replace('-W', ' W')
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  if (s.length === 1) return s[0]
  const idx = (p / 100) * (s.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return s[lo]
  return s[lo] + (s[hi] - s[lo]) * (idx - lo)
}

export function expandObservations(
  rows: RedbusSrpEntry[],
  startDate?: string,
  endDate?: string,
): SrpObservation[] {
  const out: SrpObservation[] = []
  for (const row of rows) {
    const snaps = row.snapshots || {}
    const price = parsePrice(row.price)
    const occupancy = occupancyFromRow(row)
    const rating = parseRating(row.rating)
    const reviews = parseReviews(row.reviews)
    const hour = departureHour(row.timing)
    for (const [date, rankRaw] of Object.entries(snaps)) {
      if (startDate && date < startDate) continue
      if (endDate && date > endDate) continue
      const rank = Number(rankRaw)
      if (!Number.isFinite(rank)) continue
      out.push({
        serviceKey: row.service_key,
        route: row.route,
        operator: row.operator,
        operatorDisplay: displayOperatorName(row.operator),
        timing: row.timing,
        departureHour: hour,
        date,
        rank,
        price,
        occupancy,
        rating,
        reviews,
        busType: row.bus_type || '',
      })
    }
  }
  return out
}

export function topNVisibility(obs: SrpObservation[], n: number): number | null {
  if (!obs.length) return null
  const hit = obs.filter(o => o.rank <= n).length
  return (hit / obs.length) * 100
}

/** Deduplicate service ratings across dates — one weight per service_key. */
export function weightedMarketRating(rows: RedbusSrpEntry[]): number | null {
  const seen = new Map<number, { rating: number; reviews: number }>()
  for (const row of rows) {
    const rating = parseRating(row.rating)
    const reviews = parseReviews(row.reviews) ?? 0
    if (rating == null) continue
    if (!seen.has(row.service_key)) {
      seen.set(row.service_key, { rating, reviews: Math.max(reviews, 1) })
    }
  }
  let num = 0
  let den = 0
  for (const v of seen.values()) {
    num += v.rating * v.reviews
    den += v.reviews
  }
  if (!den) return null
  return num / den
}

export function computeKpis(rows: RedbusSrpEntry[], obs: SrpObservation[]): SrpKpis {
  const prices = rows.map(r => parsePrice(r.price)).filter((v): v is number => v != null)
  const occ = rows.map(r => occupancyFromRow(r)).filter((v): v is number => v != null)
  const operators = new Set(rows.map(r => r.operator))
  return {
    totalServices: rows.length,
    medianPrice: median(prices),
    avgOccupancy: occ.length ? occ.reduce((a, b) => a + b, 0) / occ.length : null,
    occupancyLabel: 'Average observed occupancy',
    weightedRating: weightedMarketRating(rows),
    top10Visibility: topNVisibility(obs, 10),
    activeOperators: operators.size,
  }
}

export function kpiDelta(current: number | null, previous: number | null, kind: KpiDelta['kind']): KpiDelta {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return { value: null, kind: 'none' }
  }
  if (kind === 'pp' || kind === 'abs') {
    return { value: current - previous, kind }
  }
  if (kind === 'pct') {
    if (previous === 0) return { value: null, kind: 'none' }
    return { value: ((current - previous) / Math.abs(previous)) * 100, kind: 'pct' }
  }
  return { value: null, kind: 'none' }
}

export function buildSupplyTrend(
  obs: SrpObservation[],
  start: string,
  end: string,
): { key: string; label: string; services: number; grain: TemporalGrain }[] {
  const grain = pickTemporalGrain(start, end)
  const dates = enumerateDates(start, end)
  const buckets = new Map<string, number>()
  for (const d of dates) buckets.set(periodKey(d, grain), 0)
  for (const o of obs) {
    const k = periodKey(o.date, grain)
    buckets.set(k, (buckets.get(k) ?? 0) + 1)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, services]) => ({
      key,
      label: formatPeriodLabel(key, grain),
      services,
      grain,
    }))
}

export function buildVisibilityTrend(
  obs: SrpObservation[],
  start: string,
  end: string,
): { key: string; label: string; top10Pct: number | null; grain: TemporalGrain }[] {
  const grain = pickTemporalGrain(start, end)
  const dates = enumerateDates(start, end)
  const totals = new Map<string, { hit: number; n: number }>()
  for (const d of dates) totals.set(periodKey(d, grain), { hit: 0, n: 0 })
  for (const o of obs) {
    const k = periodKey(o.date, grain)
    const b = totals.get(k) ?? { hit: 0, n: 0 }
    b.n += 1
    if (o.rank <= 10) b.hit += 1
    totals.set(k, b)
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => ({
      key,
      label: formatPeriodLabel(key, grain),
      top10Pct: b.n ? (b.hit / b.n) * 100 : null,
      grain,
    }))
}

export function buildOperatorRankHeatmap(obs: SrpObservation[], rows?: RedbusSrpEntry[]) {
  const byOp = new Map<string, SrpObservation[]>()
  for (const o of obs) {
    if (!byOp.has(o.operator)) byOp.set(o.operator, [])
    byOp.get(o.operator)!.push(o)
  }

  if (rows) {
    for (const row of rows) {
      if (!byOp.has(row.operator)) byOp.set(row.operator, [])
    }
  }

  const out = [...byOp.entries()].map(([operator, list]) => {
    const total = list.length || 1
    const bands: Record<string, number> = {}
    for (const band of SRP_RANK_BANDS) {
      bands[band.id] = list.length
        ? (list.filter(o => band.test(o.rank)).length / total) * 100
        : 0
    }
    const top10 = list.length ? topNVisibility(list, 10) ?? 0 : 0
    return {
      operator,
      operatorDisplay: list[0]?.operatorDisplay ?? displayOperatorName(operator),
      bands,
      top10,
      n: list.length,
    }
  })

  out.sort((a, b) => b.top10 - a.top10 || b.n - a.n || a.operatorDisplay.localeCompare(b.operatorDisplay))
  return out
}

export function buildPriceOccupancyPoints(rows: RedbusSrpEntry[]) {
  const points: {
    id: number
    operator: string
    operatorDisplay: string
    route: string
    timing: string
    price: number
    occupancy: number
    rank: number | null
    rating: number | null
  }[] = []

  for (const row of rows) {
    const price = parsePrice(row.price)
    const occupancy = occupancyFromRow(row)
    if (price == null || occupancy == null) continue
    const ranks = Object.values(row.snapshots || {})
      .map(Number)
      .filter(n => Number.isFinite(n))
    points.push({
      id: row.service_key,
      operator: row.operator,
      operatorDisplay: displayOperatorName(row.operator),
      route: row.route,
      timing: row.timing,
      price,
      occupancy,
      rank: ranks.length ? median(ranks) : null,
      rating: parseRating(row.rating),
    })
  }
  return points
}

export function buildOperatorVisibilityRanking(obs: SrpObservation[], rows: RedbusSrpEntry[], limit = 15) {
  const byOp = new Map<string, SrpObservation[]>()
  for (const o of obs) {
    if (!byOp.has(o.operator)) byOp.set(o.operator, [])
    byOp.get(o.operator)!.push(o)
  }

  const servicesByOp = new Map<string, RedbusSrpEntry[]>()
  for (const row of rows) {
    if (!servicesByOp.has(row.operator)) servicesByOp.set(row.operator, [])
    servicesByOp.get(row.operator)!.push(row)
  }

  const operatorKeys = new Set<string>([...byOp.keys(), ...servicesByOp.keys()])

  const ranking = [...operatorKeys].map(operator => {
    const list = byOp.get(operator) || []
    const svc = servicesByOp.get(operator) || []
    const prices = svc.map(r => parsePrice(r.price)).filter((v): v is number => v != null)
    const occ = svc.map(r => occupancyFromRow(r)).filter((v): v is number => v != null)
    const ranks = list.map(o => o.rank)
    return {
      operator,
      operatorDisplay: list[0]?.operatorDisplay ?? displayOperatorName(operator),
      top10: list.length ? topNVisibility(list, 10) ?? 0 : 0,
      top20: list.length ? topNVisibility(list, 20) ?? 0 : 0,
      medianSrp: ranks.length ? median(ranks) : null,
      serviceCount: svc.length,
      medianPrice: median(prices),
      avgOccupancy: occ.length ? occ.reduce((a, b) => a + b, 0) / occ.length : null,
      weightedRating: weightedMarketRating(svc),
    }
  })

  ranking.sort((a, b) => b.top10 - a.top10 || b.serviceCount - a.serviceCount)
  if (!Number.isFinite(limit) || limit >= ranking.length) return ranking
  return ranking.slice(0, Math.max(0, limit))
}

export function buildDepartureOccupancyHeatmap(obs: SrpObservation[]) {
  type Cell = { values: number[]; n: number }
  const grid = new Map<string, Cell>()
  let withOcc = 0

  for (const o of obs) {
    if (o.occupancy == null || o.departureHour == null) continue
    withOcc += 1
    const dow = DOW[new Date(`${o.date}T12:00:00`).getDay()]
    const bucket = HOUR_BUCKETS.find(b => o.departureHour! >= b.start && o.departureHour! < b.end)
    if (!bucket) continue
    const key = `${dow}|${bucket.id}`
    const cell = grid.get(key) ?? { values: [], n: 0 }
    cell.values.push(o.occupancy)
    cell.n += 1
    grid.set(key, cell)
  }

  const cells: {
    dow: string
    bucketId: string
    bucketLabel: string
    occupancy: number | null
    n: number
  }[] = []

  for (const dow of DOW) {
    for (const bucket of HOUR_BUCKETS) {
      const cell = grid.get(`${dow}|${bucket.id}`)
      cells.push({
        dow,
        bucketId: bucket.id,
        bucketLabel: bucket.label,
        occupancy: cell ? median(cell.values) : null,
        n: cell?.n ?? 0,
      })
    }
  }

  return {
    days: [...DOW],
    buckets: HOUR_BUCKETS.map(b => ({ id: b.id, label: b.label })),
    cells,
    method: 'median' as const,
    enoughData: withOcc >= 24,
  }
}

export function buildOperatorPricePositioning(rows: RedbusSrpEntry[]) {
  const byOp = new Map<string, number[]>()
  for (const row of rows) {
    const p = parsePrice(row.price)
    if (p == null) continue
    if (!byOp.has(row.operator)) byOp.set(row.operator, [])
    byOp.get(row.operator)!.push(p)
  }

  const out = [...byOp.entries()]
    .map(([operator, prices]) => ({
      operator,
      operatorDisplay: displayOperatorName(operator),
      p25: percentile(prices, 25),
      median: median(prices),
      p75: percentile(prices, 75),
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
      n: prices.length,
    }))
    .filter(r => r.median != null)

  out.sort((a, b) => b.n - a.n || (a.median ?? 0) - (b.median ?? 0))
  return out
}

/** Operator-level price vs occupancy for clearer competitive reading than raw service scatter. */
export function buildOperatorPriceOccupancy(rows: RedbusSrpEntry[]) {
  const byOp = new Map<
    string,
    { prices: number[]; occ: number[]; operatorDisplay: string; freshbus: boolean }
  >()
  for (const row of rows) {
    const price = parsePrice(row.price)
    const occupancy = occupancyFromRow(row)
    if (price == null || occupancy == null) continue
    if (!byOp.has(row.operator)) {
      byOp.set(row.operator, {
        prices: [],
        occ: [],
        operatorDisplay: displayOperatorName(row.operator),
        freshbus: isFreshBus(row.operator),
      })
    }
    const b = byOp.get(row.operator)!
    b.prices.push(price)
    b.occ.push(occupancy)
  }

  const points = [...byOp.entries()].map(([operator, b]) => ({
    operator,
    operatorDisplay: b.operatorDisplay,
    freshbus: b.freshbus,
    price: median(b.prices) ?? 0,
    occupancy: b.occ.reduce((a, c) => a + c, 0) / b.occ.length,
    serviceCount: b.prices.length,
  }))

  points.sort((a, b) => b.serviceCount - a.serviceCount)
  return points
}

export function priceOccupancyMedians(points: { price: number; occupancy: number }[]) {
  if (!points.length) return { medianPrice: null as number | null, medianOcc: null as number | null }
  return {
    medianPrice: median(points.map(p => p.price)),
    medianOcc: median(points.map(p => p.occupancy)),
  }
}

export function formatInr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

export function formatPct1(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}%`
}

export function formatRating1(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(1)
}

export function formatDelta(delta: KpiDelta): string | null {
  if (delta.value == null || delta.kind === 'none') return null
  const sign = delta.value > 0 ? '+' : ''
  if (delta.kind === 'pct') return `${sign}${delta.value.toFixed(1)}% vs previous period`
  if (delta.kind === 'pp') return `${sign}${delta.value.toFixed(1)} pp vs previous period`
  if (delta.kind === 'abs') return `${sign}${delta.value.toFixed(2)} vs previous period`
  return null
}

export { HOUR_BUCKETS, DOW }
