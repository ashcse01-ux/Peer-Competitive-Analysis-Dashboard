/**
 * Experience KPI analytics — customer mention rates, not quality scores.
 * Eligibility matches the dashboard amenity rules: 100+ ratings per service,
 * drop cards where mentions exceed ratings, pool mentions ÷ ratings.
 * Missing tags are omitted (never treated as 0%).
 */
import type { RedbusSrpEntry } from '../api'
import { displayOperatorName, isFreshBus } from './marketplaceConfig'
import {
  enumerateDates,
  formatPeriodLabel,
  pickTemporalGrain,
  type TemporalGrain,
} from './srpVizAnalytics'

export const AMENITY_MIN_RATINGS = 100

export type ExperienceKpiId =
  | 'punctuality'
  | 'staff_behaviour'
  | 'driving'
  | 'seat_sleep_comfort'
  | 'cleanliness'
  | 'ac'
  | 'live_tracking'
  | 'rest_stop_hygiene'
  | 'seat_comfort'

export interface ExperienceKpiDef {
  id: ExperienceKpiId
  label: string
  listingTags: string[]
  color: string
}

export const EXPERIENCE_KPIS: ExperienceKpiDef[] = [
  { id: 'punctuality', label: 'Punctuality', listingTags: ['Punctuality'], color: '#0c4dc3' },
  { id: 'staff_behaviour', label: 'Staff Behaviour', listingTags: ['Staff behavior', 'Staff behaviour'], color: '#4f46e5' },
  { id: 'driving', label: 'Driving', listingTags: ['Driving'], color: '#d97706' },
  {
    id: 'seat_sleep_comfort',
    label: 'Seat / Sleep Comfort',
    listingTags: ['Seat / Sleep Comfort', 'Seat/Sleep Comfort', 'Seat / Sleep Comfort'],
    color: '#be185d',
  },
  { id: 'cleanliness', label: 'Cleanliness', listingTags: ['Cleanliness'], color: '#0284c7' },
  { id: 'ac', label: 'AC', listingTags: ['AC'], color: '#0e7490' },
  { id: 'live_tracking', label: 'Live Tracking', listingTags: ['Live tracking', 'Live Tracking'], color: '#2563eb' },
  {
    id: 'rest_stop_hygiene',
    label: 'Rest Stop Hygiene',
    listingTags: ['Rest stop hygiene', 'Rest Stop Hygiene'],
    color: '#0f766e',
  },
  { id: 'seat_comfort', label: 'Seat Comfort', listingTags: ['Seat Comfort', 'Seat comfort'], color: '#7c3aed' },
]

export const OPERATOR_SERIES_COLORS = [
  '#0c4dc3',
  '#D4AF37',
  '#0284c7',
  '#7c3aed',
  '#d97706',
  '#0f766e',
  '#e11d48',
  '#4338ca',
  '#0891b2',
  '#65a30d',
  '#c026d3',
  '#1d4ed8',
]

export interface MentionPool {
  mentions: number
  ratings: number
  services: number
}

export interface ComboObservation {
  key: string
  operator: string
  operatorDisplay: string
  freshbus: boolean
  route: string
  serviceCount: number
  avgRating: number | null
  occupancy: number | null
  avgPrice: number | null
  avgSrp: number | null
  ratingVolume: number
  kpis: Partial<Record<ExperienceKpiId, number>>
  pools: Partial<Record<ExperienceKpiId, MentionPool>>
}

function parseReviews(raw: string | null | undefined): number | null {
  if (!raw) return null
  const n = Number(String(raw).replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseRating(raw: string | null | undefined): number | null {
  if (!raw || raw === '0') return null
  const n = parseFloat(String(raw))
  return Number.isFinite(n) && n > 0 ? n : null
}

function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null
  const n = Number(String(raw).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : null
}

function listingMentions(row: RedbusSrpEntry, kpi: ExperienceKpiDef): number | null {
  if (!Array.isArray(row.tags)) return null
  const wants = new Set(
    kpi.listingTags.map(t => t.trim().toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ')),
  )
  const match = row.tags.find((t: { tagmsg?: string; label?: string; name?: string; tagName?: string }) => {
    const name = t.tagmsg || t.label || t.name || t.tagName || ''
    const n = String(name).trim().toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ')
    return wants.has(n)
  })
  if (!match) return null
  const raw =
    (match as { NoOfUsers?: number }).NoOfUsers ??
    (match as { noOfUsers?: number }).noOfUsers ??
    (match as { count?: number }).count ??
    (match as { review_count?: number }).review_count
  const cnt = Number(raw)
  if (!Number.isFinite(cnt) || cnt < 0) return null
  return cnt
}

export function mentionRate(pool: MentionPool | null | undefined): number | null {
  if (!pool || pool.ratings <= 0 || pool.services <= 0) return null
  return (100 * pool.mentions) / pool.ratings
}

function addPool(target: MentionPool, mentions: number, ratings: number) {
  target.mentions += mentions
  target.ratings += ratings
  target.services += 1
}

/** Eligible service contribution for one KPI, or null if ineligible / missing. */
export function eligibleKpiContribution(row: RedbusSrpEntry, kpi: ExperienceKpiDef): MentionPool | null {
  const ratings = parseReviews(row.reviews)
  if (ratings == null || ratings < AMENITY_MIN_RATINGS) return null
  const mentions = listingMentions(row, kpi)
  if (mentions == null) return null
  if (mentions > ratings) return null
  return { mentions, ratings, services: 1 }
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function serviceAvgSrp(row: RedbusSrpEntry): number | null {
  const slots = Object.values(row.snapshots || {})
    .map(Number)
    .filter(n => Number.isFinite(n) && n > 0)
  return mean(slots)
}

function opColor(index: number, fresh: boolean): string {
  if (fresh) return '#D4AF37'
  return OPERATOR_SERIES_COLORS[index % OPERATOR_SERIES_COLORS.length]
}

export function displayOp(name: string): string {
  return isFreshBus(name) ? 'FreshBus' : displayOperatorName(name)
}

function emptyPools(): Record<ExperienceKpiId, MentionPool> {
  return Object.fromEntries(EXPERIENCE_KPIS.map(k => [k.id, { mentions: 0, ratings: 0, services: 0 }])) as Record<
    ExperienceKpiId,
    MentionPool
  >
}

export function poolMarketKpis(rows: RedbusSrpEntry[]): Record<ExperienceKpiId, MentionPool> {
  const pools = emptyPools()
  for (const row of rows) {
    for (const kpi of EXPERIENCE_KPIS) {
      const c = eligibleKpiContribution(row, kpi)
      if (!c) continue
      addPool(pools[kpi.id], c.mentions, c.ratings)
    }
  }
  return pools
}

export function poolByOperator(rows: RedbusSrpEntry[]): {
  operator: string
  operatorDisplay: string
  freshbus: boolean
  serviceCount: number
  pools: Record<ExperienceKpiId, MentionPool>
}[] {
  const map = new Map<string, { serviceCount: number; pools: Record<ExperienceKpiId, MentionPool> }>()
  for (const row of rows) {
    if (!map.has(row.operator)) {
      map.set(row.operator, { serviceCount: 0, pools: emptyPools() })
    }
    const agg = map.get(row.operator)!
    agg.serviceCount += 1
    for (const kpi of EXPERIENCE_KPIS) {
      const c = eligibleKpiContribution(row, kpi)
      if (!c) continue
      addPool(agg.pools[kpi.id], c.mentions, c.ratings)
    }
  }
  return [...map.entries()]
    .map(([operator, agg]) => ({
      operator,
      operatorDisplay: displayOp(operator),
      freshbus: isFreshBus(operator),
      serviceCount: agg.serviceCount,
      pools: agg.pools,
    }))
    .sort((a, b) => b.serviceCount - a.serviceCount || a.operatorDisplay.localeCompare(b.operatorDisplay))
}

export function poolByRoute(rows: RedbusSrpEntry[]): {
  route: string
  serviceCount: number
  pools: Record<ExperienceKpiId, MentionPool>
}[] {
  const map = new Map<string, { serviceCount: number; pools: Record<ExperienceKpiId, MentionPool> }>()
  for (const row of rows) {
    const route = row.route?.trim()
    if (!route) continue
    if (!map.has(route)) map.set(route, { serviceCount: 0, pools: emptyPools() })
    const agg = map.get(route)!
    agg.serviceCount += 1
    for (const kpi of EXPERIENCE_KPIS) {
      const c = eligibleKpiContribution(row, kpi)
      if (!c) continue
      addPool(agg.pools[kpi.id], c.mentions, c.ratings)
    }
  }
  return [...map.entries()]
    .map(([route, agg]) => ({ route, serviceCount: agg.serviceCount, pools: agg.pools }))
    .sort((a, b) => b.serviceCount - a.serviceCount || a.route.localeCompare(b.route))
}

export function comboObservations(rows: RedbusSrpEntry[]): ComboObservation[] {
  const map = new Map<
    string,
    {
      operator: string
      route: string
      serviceCount: number
      ratingW: number
      ratingN: number
      occ: number[]
      prices: number[]
      srps: number[]
      pools: Record<ExperienceKpiId, MentionPool>
    }
  >()
  for (const row of rows) {
    const route = row.route?.trim()
    if (!route) continue
    const key = `${row.operator}::${route}`
    if (!map.has(key)) {
      map.set(key, {
        operator: row.operator,
        route,
        serviceCount: 0,
        ratingW: 0,
        ratingN: 0,
        occ: [],
        prices: [],
        srps: [],
        pools: emptyPools(),
      })
    }
    const agg = map.get(key)!
    agg.serviceCount += 1
    const rating = parseRating(row.rating)
    const reviews = parseReviews(row.reviews)
    if (rating != null && reviews != null) {
      agg.ratingW += rating * reviews
      agg.ratingN += reviews
    } else if (rating != null) {
      agg.ratingW += rating
      agg.ratingN += 1
    }
    if (row.occupancy_pct != null && Number.isFinite(Number(row.occupancy_pct))) {
      agg.occ.push(Number(row.occupancy_pct))
    }
    const price = parsePrice(row.price)
    if (price != null) agg.prices.push(price)
    const srp = serviceAvgSrp(row)
    if (srp != null) agg.srps.push(srp)
    for (const kpi of EXPERIENCE_KPIS) {
      const c = eligibleKpiContribution(row, kpi)
      if (!c) continue
      addPool(agg.pools[kpi.id], c.mentions, c.ratings)
    }
  }

  return [...map.entries()]
    .map(([key, agg]) => {
      const kpis: Partial<Record<ExperienceKpiId, number>> = {}
      const pools: Partial<Record<ExperienceKpiId, MentionPool>> = {}
      for (const kpi of EXPERIENCE_KPIS) {
        const p = agg.pools[kpi.id]
        const rate = mentionRate(p)
        if (rate == null) continue
        kpis[kpi.id] = rate
        pools[kpi.id] = p
      }
      const ratingVolume = Math.max(...EXPERIENCE_KPIS.map(k => agg.pools[k.id].ratings), 0)
      return {
        key,
        operator: agg.operator,
        operatorDisplay: displayOp(agg.operator),
        freshbus: isFreshBus(agg.operator),
        route: agg.route,
        serviceCount: agg.serviceCount,
        avgRating: agg.ratingN > 0 ? agg.ratingW / agg.ratingN : null,
        occupancy: mean(agg.occ),
        avgPrice: mean(agg.prices),
        avgSrp: mean(agg.srps),
        ratingVolume,
        kpis,
        pools,
      }
    })
    .sort((a, b) => b.serviceCount - a.serviceCount || a.operatorDisplay.localeCompare(b.operatorDisplay))
}

function periodKey(iso: string, grain: TemporalGrain): string {
  if (grain === 'day') return iso
  if (grain === 'month') return iso.slice(0, 7)
  const d = new Date(`${iso}T12:00:00`)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day + 3)
  const week1 = new Date(d.getFullYear(), 0, 4)
  const week =
    1 +
    Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function appearedInPeriod(row: RedbusSrpEntry, dates: Set<string>): boolean {
  return Object.keys(row.snapshots || {}).some(d => dates.has(d))
}

export function trendByPeriod(
  rows: RedbusSrpEntry[],
  startDate: string,
  endDate: string,
  kpi: ExperienceKpiDef,
): { key: string; label: string; grain: TemporalGrain; market: number | null; byOperator: Record<string, number | null> }[] {
  const grain = pickTemporalGrain(startDate, endDate)
  const dates = enumerateDates(startDate, endDate)
  const buckets = new Map<string, Set<string>>()
  for (const d of dates) {
    const k = periodKey(d, grain)
    if (!buckets.has(k)) buckets.set(k, new Set())
    buckets.get(k)!.add(d)
  }
  const operators = [...new Set(rows.map(r => r.operator))]
  return [...buckets.entries()].map(([key, dateSet]) => {
    const inPeriod = rows.filter(r => appearedInPeriod(r, dateSet))
    const marketPool: MentionPool = { mentions: 0, ratings: 0, services: 0 }
    const opPools = new Map<string, MentionPool>()
    for (const row of inPeriod) {
      const c = eligibleKpiContribution(row, kpi)
      if (!c) continue
      addPool(marketPool, c.mentions, c.ratings)
      if (!opPools.has(row.operator)) opPools.set(row.operator, { mentions: 0, ratings: 0, services: 0 })
      addPool(opPools.get(row.operator)!, c.mentions, c.ratings)
    }
    const byOperator: Record<string, number | null> = {}
    for (const op of operators) {
      byOperator[op] = mentionRate(opPools.get(op))
    }
    return {
      key,
      label: formatPeriodLabel(key, grain),
      grain,
      market: mentionRate(marketPool),
      byOperator,
    }
  })
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 4) return null
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
    sxx += xs[i] * xs[i]
    syy += ys[i] * ys[i]
    sxy += xs[i] * ys[i]
  }
  const num = n * sxy - sx * sy
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
  if (!den || !Number.isFinite(den)) return null
  const r = num / den
  if (!Number.isFinite(r)) return null
  return Math.max(-1, Math.min(1, r))
}

export function kpiCorrelation(combos: ComboObservation[]): (number | null)[][] {
  return EXPERIENCE_KPIS.map(a =>
    EXPERIENCE_KPIS.map(b => {
      if (a.id === b.id) return 1
      const xs: number[] = []
      const ys: number[] = []
      for (const c of combos) {
        const va = c.kpis[a.id]
        const vb = c.kpis[b.id]
        if (va == null || vb == null) continue
        xs.push(va)
        ys.push(vb)
      }
      return pearson(xs, ys)
    }),
  )
}

export function operatorColorMap(operators: { operator: string; freshbus: boolean }[]): Map<string, string> {
  const map = new Map<string, string>()
  let i = 0
  for (const op of operators) {
    map.set(op.operator, opColor(i, op.freshbus))
    if (!op.freshbus) i += 1
  }
  return map
}

export function formatRate(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v.toFixed(1)}%`
}

export function findKpi(id: ExperienceKpiId): ExperienceKpiDef {
  return EXPERIENCE_KPIS.find(k => k.id === id) ?? EXPERIENCE_KPIS[0]
}
