/**
 * Filter-reactive KPI snapshot from Redbus service listings.
 * Null/missing values are excluded — never treated as 0.
 */
import type { RedbusSrpEntry } from '../api'
import { classifyBusType } from './srpFilters'

export const QUALITY_DIMENSIONS = [
  { id: 'punctuality', label: 'Punctuality', tags: ['Punctuality'] },
  { id: 'cleanliness', label: 'Cleanliness', tags: ['Cleanliness'] },
  { id: 'staff_behavior', label: 'Staff Behaviour', tags: ['Staff behavior', 'Staff behaviour'] },
  { id: 'driving', label: 'Driving', tags: ['Driving'] },
  { id: 'ac', label: 'AC', tags: ['AC'] },
  { id: 'seat_comfort', label: 'Seat Comfort', tags: ['Seat Comfort', 'Seat comfort'] },
  { id: 'live_tracking', label: 'Live Tracking', tags: ['Live tracking', 'Live Tracking'] },
  {
    id: 'rest_stop_hygiene',
    label: 'Rest Stop Hygiene',
    tags: ['Rest stop hygiene', 'Rest Stop Hygiene'],
  },
] as const

export type QualityDimId = (typeof QUALITY_DIMENSIONS)[number]['id']

export interface FareByBusType {
  seater: { avg: number | null; n: number }
  sleeper: { avg: number | null; n: number }
  semi: { avg: number | null; n: number }
}

export interface SrpFilterKpis {
  serviceCount: number
  operatorCount: number
  routeCount: number
  fareByBusType: FareByBusType
  fareTypeN: number
  avgRating: number | null
  ratingN: number
  pctRatingGe45: number | null
  avgSrp: number | null
  srpN: number
  /** Mean SRP among the best (lowest-rank) 5% of ranked services. */
  top5PctAvgSrp: number | null
  /** Mean SRP among the best (lowest-rank) 10% of ranked services. */
  top10PctAvgSrp: number | null
  serviceQuality: number | null
  serviceQualityN: number
  qualityDims: Record<QualityDimId, { avg: number | null; n: number }>
}

function normalizeTag(name: string) {
  return name.trim().toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ')
}

export function parseFare(raw: string | null | undefined): number | null {
  if (!raw) return null
  const n = Number(String(raw).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function parseRatingValue(raw: string | null | undefined): number | null {
  if (!raw || raw === '0') return null
  const n = parseFloat(String(raw))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function parseReviewsValue(raw: string | null | undefined): number | null {
  if (!raw) return null
  const n = Number(String(raw).replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function avgSrpRank(row: RedbusSrpEntry): number | null {
  const slots = Object.values(row.snapshots || {})
    .map(Number)
    .filter(n => Number.isFinite(n) && n > 0)
  if (!slots.length) return null
  return slots.reduce((a, b) => a + b, 0) / slots.length
}

function tagMentions(row: RedbusSrpEntry, tags: readonly string[]): number | null {
  if (!Array.isArray(row.tags)) return null
  const wants = new Set(tags.map(normalizeTag))
  const match = row.tags.find(t => {
    const name = t.tagmsg || t.label || t.name || t.tagName || ''
    return wants.has(normalizeTag(String(name)))
  })
  if (!match) return null
  const raw =
    match.NoOfUsers ?? match.noOfUsers ?? match.count ?? match.review_count ?? match.score
  const cnt = Number(raw)
  return Number.isFinite(cnt) && cnt >= 0 ? cnt : null
}

/** Mention user count. Null when tag is missing / invalid. */
export function qualityRate(row: RedbusSrpEntry, tags: readonly string[]): number | null {
  const mentions = tagMentions(row, tags)
  if (mentions == null) return null
  return mentions
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Mean of the best (lowest) `pct`% of values. */
function topPercentMean(values: number[], pct: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const take = Math.max(1, Math.ceil((sorted.length * pct) / 100))
  return mean(sorted.slice(0, take))
}

function emptyQualityDims(): Record<QualityDimId, { avg: number | null; n: number }> {
  return Object.fromEntries(
    QUALITY_DIMENSIONS.map(d => [d.id, { avg: null as number | null, n: 0 }]),
  ) as Record<QualityDimId, { avg: number | null; n: number }>
}

function emptyFareByBusType(): FareByBusType {
  return {
    seater: { avg: null, n: 0 },
    sleeper: { avg: null, n: 0 },
    semi: { avg: null, n: 0 },
  }
}

export function computeSrpFilterKpis(filtered: RedbusSrpEntry[]): SrpFilterKpis {
  const empty: SrpFilterKpis = {
    serviceCount: 0,
    operatorCount: 0,
    routeCount: 0,
    fareByBusType: emptyFareByBusType(),
    fareTypeN: 0,
    avgRating: null,
    ratingN: 0,
    pctRatingGe45: null,
    avgSrp: null,
    srpN: 0,
    top5PctAvgSrp: null,
    top10PctAvgSrp: null,
    serviceQuality: null,
    serviceQualityN: 0,
    qualityDims: emptyQualityDims(),
  }

  if (!filtered.length) return empty

  const operators = new Set(filtered.map(r => r.operator).filter(Boolean))
  const routes = new Set(filtered.map(r => r.route).filter(Boolean))

  const seaterFares: number[] = []
  const sleeperFares: number[] = []
  const semiFares: number[] = []
  for (const row of filtered) {
    const fare = parseFare(row.price)
    if (fare == null) continue
    const bucket = classifyBusType(row.bus_type)
    if (bucket === 'seater') seaterFares.push(fare)
    else if (bucket === 'sleeper') sleeperFares.push(fare)
    else if (bucket === 'semi') semiFares.push(fare)
  }

  const ratings = filtered.map(r => parseRatingValue(r.rating)).filter((v): v is number => v != null)
  const srps = filtered.map(r => avgSrpRank(r)).filter((v): v is number => v != null)

  const qualityDims = emptyQualityDims()
  for (const dim of QUALITY_DIMENSIONS) {
    const vals = filtered.map(r => qualityRate(r, dim.tags)).filter((v): v is number => v != null)
    qualityDims[dim.id] = { avg: mean(vals), n: vals.length }
  }

  const serviceQualityPerRow: number[] = []
  for (const row of filtered) {
    const dims = QUALITY_DIMENSIONS.map(d => qualityRate(row, d.tags)).filter(
      (v): v is number => v != null,
    )
    if (!dims.length) continue
    serviceQualityPerRow.push(dims.reduce((a, b) => a + b, 0) / dims.length)
  }

  return {
    serviceCount: filtered.length,
    operatorCount: operators.size,
    routeCount: routes.size,
    fareByBusType: {
      seater: { avg: mean(seaterFares), n: seaterFares.length },
      sleeper: { avg: mean(sleeperFares), n: sleeperFares.length },
      semi: { avg: mean(semiFares), n: semiFares.length },
    },
    fareTypeN: seaterFares.length + sleeperFares.length + semiFares.length,
    avgRating: mean(ratings),
    ratingN: ratings.length,
    pctRatingGe45: ratings.length
      ? (100 * ratings.filter(r => r >= 4.5).length) / ratings.length
      : null,
    avgSrp: mean(srps),
    srpN: srps.length,
    top5PctAvgSrp: topPercentMean(srps, 5),
    top10PctAvgSrp: topPercentMean(srps, 10),
    serviceQuality: mean(serviceQualityPerRow),
    serviceQualityN: serviceQualityPerRow.length,
    qualityDims,
  }
}

export function formatInrKpi(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

export function formatNum1(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return (Math.round(value * 10) / 10).toFixed(1)
}

export function formatNum2(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return (Math.round(value * 100) / 100).toFixed(2)
}

export function formatPct0(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value)}%`
}
