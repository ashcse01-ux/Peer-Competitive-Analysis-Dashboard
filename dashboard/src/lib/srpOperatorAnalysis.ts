/**
 * Operator-level SRP aggregates from flat RedbusSrpEntry rows.
 */
import type { RedbusSrpEntry } from '../api'
import { weekBucketForDay, type WeekBucket } from './srpAnalytics'
import { isFreshBus, displayOperatorName } from './marketplaceConfig'

export interface OperatorAnalysisRow {
  operator: string
  displayName: string
  freshbus: boolean
  totalServices: number
  bestSrp: number | null
  worstSrp: number | null
  top5Services: number
  top10Services: number
  avgRating: number | null
  avgReviews: number | null
  avgOccupancy: number | null
  avgPrice: number | null
  /** Mean SRP across all service-day observations in the period. */
  avgSrp: number | null
  /** Unified market-leader score 0–100 (higher = stronger). */
  leaderScore: number
  /** 1 = market leader, 2 = next, … */
  marketRank: number
  /** date ISO → mean SRP for that day across this operator's services */
  dailySrp: Record<string, number | null>
  isMarketLeader: boolean
}

export type DateExpandMode = 'days' | 'months'

function priceNumber(raw: string | null | undefined): number | null {
  if (!raw) return null
  const n = Number(String(raw).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : null
}

function ratingNumber(raw: string | null | undefined): number | null {
  const n = parseFloat(String(raw ?? ''))
  return Number.isFinite(n) ? n : null
}

function reviewsNumber(raw: string | null | undefined): number | null {
  const n = Number(String(raw ?? '').replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : null
}

export function collectAnalysisDates(
  rows: RedbusSrpEntry[],
  startDate?: string,
  endDate?: string,
): string[] {
  const set = new Set<string>()
  for (const row of rows) {
    for (const d of Object.keys(row.snapshots || {})) {
      if (startDate && d < startDate) continue
      if (endDate && d > endDate) continue
      set.add(d)
    }
  }
  return [...set].sort()
}

export function analysisExpandMode(dates: string[]): DateExpandMode {
  const months = new Set(dates.map(d => d.slice(0, 7)))
  return months.size > 1 ? 'months' : 'days'
}

export function monthKeysFromDates(dates: string[]): string[] {
  return [...new Set(dates.map(d => d.slice(0, 7)))].sort()
}

export function datesInMonth(dates: string[], monthKey: string): string[] {
  return dates.filter(d => d.startsWith(monthKey))
}

export function weekBucketsPresent(dates: string[]): WeekBucket[] {
  const set = new Set<WeekBucket>()
  for (const d of dates) {
    const day = Number(d.slice(8, 10))
    set.add(weekBucketForDay(day))
  }
  return ([1, 2, 3, 4] as WeekBucket[]).filter(b => set.has(b))
}

export function datesInWeekBucket(dates: string[], bucket: WeekBucket): string[] {
  return dates.filter(d => weekBucketForDay(Number(d.slice(8, 10))) === bucket)
}

export function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function formatSrp(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  return (Math.round(value * 10 ** digits) / 10 ** digits).toFixed(digits)
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[(m ?? 1) - 1] ?? m} ${y}`
}

export function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[(m ?? 1) - 1] ?? m}`
}

export function formatPeriodRangeLabel(dates: string[]): string {
  if (!dates.length) return 'Period'
  if (dates.length === 1) return formatDayLabel(dates[0])
  return `${formatDayLabel(dates[0])} – ${formatDayLabel(dates[dates.length - 1])}`
}

export function buildOperatorAnalysisRows(
  rows: RedbusSrpEntry[],
  dates: string[],
): OperatorAnalysisRow[] {
  const byOp = new Map<string, RedbusSrpEntry[]>()
  for (const row of rows) {
    const key = row.operator || 'Unknown'
    if (!byOp.has(key)) byOp.set(key, [])
    byOp.get(key)!.push(row)
  }

  const built: OperatorAnalysisRow[] = []

  for (const [operator, services] of byOp) {
    const allRanks: number[] = []
    const dailyBuckets: Record<string, number[]> = {}
    for (const d of dates) dailyBuckets[d] = []

    let top5 = 0
    let top10 = 0
    const ratings: number[] = []
    const reviews: number[] = []
    const occupancies: number[] = []
    const prices: number[] = []

    for (const svc of services) {
      const snaps = svc.snapshots || {}
      const svcRanks: number[] = []
      for (const d of dates) {
        const r = snaps[d]
        if (r == null || Number.isNaN(Number(r))) continue
        const n = Number(r)
        svcRanks.push(n)
        allRanks.push(n)
        dailyBuckets[d].push(n)
      }
      if (svcRanks.length && Math.min(...svcRanks) <= 5) top5 += 1
      if (svcRanks.length && Math.min(...svcRanks) <= 10) top10 += 1

      const rt = ratingNumber(svc.rating)
      if (rt != null) ratings.push(rt)
      const rv = reviewsNumber(svc.reviews)
      if (rv != null) reviews.push(rv)
      if (svc.occupancy_pct != null && Number.isFinite(Number(svc.occupancy_pct))) {
        occupancies.push(Number(svc.occupancy_pct))
      }
      const pr = priceNumber(svc.price)
      if (pr != null) prices.push(pr)
    }

    const dailySrp: Record<string, number | null> = {}
    for (const d of dates) {
      dailySrp[d] = mean(dailyBuckets[d])
    }

    built.push({
      operator,
      displayName: displayOperatorName(operator),
      freshbus: isFreshBus(operator),
      totalServices: services.length,
      bestSrp: allRanks.length ? Math.min(...allRanks) : null,
      worstSrp: allRanks.length ? Math.max(...allRanks) : null,
      top5Services: top5,
      top10Services: top10,
      avgRating: mean(ratings),
      avgReviews: mean(reviews),
      avgOccupancy: mean(occupancies),
      avgPrice: mean(prices),
      avgSrp: mean(allRanks),
      leaderScore: 0,
      marketRank: 0,
      dailySrp,
      isMarketLeader: false,
    })
  }

  assignMarketLeaders(built)

  built.sort((a, b) => a.marketRank - b.marketRank || b.leaderScore - a.leaderScore)

  return built
}

/**
 * Unified Market Score (0–100) — volume-governed, sample-size aware.
 *
 *   50 × Presence      log1p(services) / log1p(maxServices)
 * + 25 × SRP quality   (1 / shrunkAvgSrp) / max(...), Bayes-shrunk toward market median
 * + 15 × Top-5 volume  top5Services / max(top5Services)   ← absolute inventory, not share
 * + 10 × Rating        shrunkAvgRating / 5
 *
 * Shrinkage: credibility = n / (n + 10). Small fleets are pulled toward the market
 * so a 4-service operator cannot outrank a 150+ fleet on lucky SRP alone.
 *
 * Market Position = rank by this score (everyone gets a rank).
 * Tie-break: more services → better avg SRP → higher rating.
 */
export function assignMarketLeaders(rows: OperatorAnalysisRow[]) {
  if (!rows.length) return

  const SHRINK_K = 10
  const maxServices = Math.max(...rows.map(r => r.totalServices), 1)
  const maxTop5 = Math.max(...rows.map(r => r.top5Services), 1)
  const logMax = Math.log1p(maxServices)

  const srpVals = rows.map(r => r.avgSrp).filter((v): v is number => v != null && v > 0)
  const ratingVals = rows.map(r => r.avgRating).filter((v): v is number => v != null && v > 0)
  const marketMedianSrp = median(srpVals) ?? 20
  const marketMeanRating = mean(ratingVals) ?? 3.5

  const shrunkInvSrp = rows.map(r => {
    const n = r.totalServices
    const c = n / (n + SHRINK_K)
    const raw = r.avgSrp != null && r.avgSrp > 0 ? r.avgSrp : marketMedianSrp
    const shrunk = c * raw + (1 - c) * marketMedianSrp
    return shrunk > 0 ? 1 / shrunk : 0
  })
  const maxInvSrp = Math.max(...shrunkInvSrp, 1e-9)

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const n = r.totalServices
    const credibility = n / (n + SHRINK_K)

    const presence = logMax > 0 ? Math.log1p(n) / logMax : 0
    const srpQuality = shrunkInvSrp[i] / maxInvSrp
    const top5Volume = maxTop5 > 0 ? r.top5Services / maxTop5 : 0

    const rawRating = r.avgRating != null ? Math.min(Math.max(r.avgRating, 0), 5) : marketMeanRating
    const shrunkRating = credibility * rawRating + (1 - credibility) * marketMeanRating
    const ratingQuality = Math.min(Math.max(shrunkRating, 0), 5) / 5

    r.leaderScore =
      Math.round((0.5 * presence + 0.25 * srpQuality + 0.15 * top5Volume + 0.1 * ratingQuality) * 1000) / 10
    r.isMarketLeader = false
    r.marketRank = 0
  }

  const ranked = [...rows].sort((a, b) => {
    if (b.leaderScore !== a.leaderScore) return b.leaderScore - a.leaderScore
    if (b.totalServices !== a.totalServices) return b.totalServices - a.totalServices
    const as = a.avgSrp ?? Number.POSITIVE_INFINITY
    const bs = b.avgSrp ?? Number.POSITIVE_INFINITY
    if (as !== bs) return as - bs
    return (b.avgRating ?? 0) - (a.avgRating ?? 0)
  })

  ranked.forEach((r, idx) => {
    r.marketRank = idx + 1
    r.isMarketLeader = idx === 0 && r.leaderScore > 0
  })
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function avgSrpForDates(row: OperatorAnalysisRow, subset: string[]): number | null {
  const vals = subset.map(d => row.dailySrp[d]).filter((v): v is number => v != null)
  return mean(vals)
}
