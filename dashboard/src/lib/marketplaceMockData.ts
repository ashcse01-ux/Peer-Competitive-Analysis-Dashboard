import {
  MARKETPLACE_TAG_IDS,
  type MarketplaceId,
  type MarketplaceRoute,
  type MarketplaceTagId,
  isFreshBus,
  marketplaceRoutes,
  operatorSlug,
  displayOperatorName,
} from './marketplaceConfig'
import {
  type SrpSlotKey,
  SRP_SLOT_KEYS,
  canonicalOperatorDisplay,
  canonicalOperatorId,
  type SrpSnapshotGrid,
  type SrpSlotSnapshot,
} from './srpAnalytics'

export type { SrpSnapshotGrid, SrpSlotSnapshot } from './srpAnalytics'

export interface OperatorKpiRow {
  slug: string
  name: string
  routeKey: string
  overallRating: number
  reviewCount: number
  competitiveRank: number
  sentiment: number
  compositeTagScore: number
  tags: Record<MarketplaceTagId, number>
  visibilityScore: number
}

export interface RouteSummary {
  route: MarketplaceRoute
  operators: OperatorKpiRow[]
  freshbusRank: number | null
  leaderName: string
  avgRating: number
}

export interface SrpTimingRow {
  operator: string
  slug: string
  serviceLabel: string
  departureTime: string
  ranks: Record<string, number | null>
}

/** One scraped bus service — raw snapshots only; averages computed in srpAnalytics. */
export interface SrpServiceRecord {
  serviceId: string
  serviceLabel: string
  departureTime: string
  scrapedOperatorName: string
  canonicalOperatorId: string
  snapshotsByDate: SrpSnapshotGrid
}

export interface SrpOperatorBlock {
  canonicalId: string
  displayName: string
  scrapedNames: string[]
  services: SrpServiceRecord[]
}

export interface SrpRouteTree {
  routeKey: string
  routeLabel: string
  operators: SrpOperatorBlock[]
}

/** @deprecated Use SrpRouteTree */
export interface SrpRouteBlock {
  routeKey: string
  routeLabel: string
  operator: string
  services: SrpServiceRecord[]
}

function hashSeed(...parts: string[]) {
  let h = 2166136261
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) h = Math.imul(h ^ p.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

function seededFloat(seed: number, min: number, max: number) {
  const x = Math.sin(seed) * 10000
  const f = x - Math.floor(x)
  return min + f * (max - min)
}

function seededInt(seed: number, min: number, max: number) {
  return Math.round(seededFloat(seed, min, max))
}

export function buildRouteKpis(marketplace: MarketplaceId, route: MarketplaceRoute): OperatorKpiRow[] {
  const rows = route.operators.map((name, index) => {
    const seed = hashSeed(marketplace, route.key, name)
    const freshbusBoost = isFreshBus(name) ? 0.15 : 0
    const overallRating = Math.round(seededFloat(seed, 3.2, 4.95) * 100) / 100 + freshbusBoost
    const rating = Math.min(5, Math.round(overallRating * 100) / 100)
    const reviewCount = seededInt(seed + 1, isFreshBus(name) ? 180 : 40, isFreshBus(name) ? 920 : 680)
    const sentiment = Math.round(seededFloat(seed + 2, 0.15, 0.88) * 1000) / 1000
    const tags = Object.fromEntries(
      MARKETPLACE_TAG_IDS.map((tag, ti) => [
        tag,
        Math.round(seededFloat(seed + 100 + ti, 3.0, 4.9) * 100) / 100 + (isFreshBus(name) ? 0.08 : 0),
      ]),
    ) as Record<MarketplaceTagId, number>
    const compositeTagScore =
      Math.round((Object.values(tags).reduce((a, b) => a + Math.min(5, b), 0) / MARKETPLACE_TAG_IDS.length) * 100) / 100
    return {
      slug: operatorSlug(name),
      name,
      routeKey: route.key,
      overallRating: rating,
      reviewCount,
      competitiveRank: 0,
      sentiment,
      compositeTagScore,
      tags,
      visibilityScore: Math.round(seededFloat(seed + 3, 42, 98)),
    }
  })

  rows.sort((a, b) => b.overallRating - a.overallRating || b.reviewCount - a.reviewCount)
  rows.forEach((row, i) => {
    row.competitiveRank = i + 1
  })
  return rows
}

export function buildAllRouteSummaries(marketplace: MarketplaceId): RouteSummary[] {
  return marketplaceRoutes().map(route => {
    const operators = buildRouteKpis(marketplace, route)
    const freshbus = operators.find(o => isFreshBus(o.name))
    const leader = operators[0]
    const avgRating =
      Math.round((operators.reduce((s, o) => s + o.overallRating, 0) / operators.length) * 100) / 100
    return {
      route,
      operators,
      freshbusRank: freshbus?.competitiveRank ?? null,
      leaderName: leader?.name ?? '—',
      avgRating,
    }
  })
}

export function freshbusRankTrend(marketplace: MarketplaceId, routeKey: string): { slot: string; rank: number }[] {
  return ['05:00', '11:00', '17:00', '23:00'].map((slot, i) => ({
    slot,
    rank: seededInt(hashSeed(marketplace, routeKey, slot), 1, 12) + (i % 2),
  }))
}

function buildServiceSnapshots(
  seed: number,
  dates: string[],
  baseRating: number | null,
  baseCount: number | null,
): SrpSnapshotGrid {
  const grid: SrpSnapshotGrid = {}
  let cumulativeCount = baseCount ?? 0
  let currentRating = baseRating

  dates.forEach((date, di) => {
    grid[date] = {} as Record<SrpSlotKey, SrpSlotSnapshot>
    SRP_SLOT_KEYS.forEach((slot, slotIdx) => {
      const miss = seededInt(seed + di * 10 + slotIdx, 0, 20) === 0
      const srp = miss ? null : seededInt(seed + di * 4 + slotIdx, 1, 48)

      if (baseRating != null && baseCount != null) {
        cumulativeCount = baseCount + di * 4 + slotIdx + 1
        currentRating = Math.round((baseRating + seededFloat(seed + 500 + di, -0.08, 0.08)) * 100) / 100
      }

      grid[date][slot] = {
        srp,
        rating: currentRating,
        ratingCount: baseRating != null ? cumulativeCount : null,
      }
    })
  })
  return grid
}

function buildServicesForOperator(
  marketplace: MarketplaceId,
  route: MarketplaceRoute,
  operatorName: string,
  dates: string[],
): SrpServiceRecord[] {
  const serviceCount = seededInt(hashSeed(marketplace, route.key, operatorName, 'svc-count'), 3, 5)
  const services: SrpServiceRecord[] = []
  const canonicalId = canonicalOperatorId(operatorName)

  for (let si = 0; si < serviceCount; si++) {
    const departureHour = [5, 8, 14, 18, 22][si % 5]
    const departureMin = [30, 15, 0, 45, 30][si % 5]
    const departureTime = `${String(departureHour).padStart(2, '0')}:${String(departureMin).padStart(2, '0')}`
    const serviceLabel = `${canonicalOperatorDisplay(operatorName).split(' ')[0]} ${['Express', 'Plus', 'Night Rider', 'Day Service', 'AC Sleeper'][si % 5]}`
    const seed = hashSeed(marketplace, route.key, operatorName, serviceLabel, String(si))

    const hasRating = seededInt(seed + 50, 0, 10) > 1
    const baseRating = hasRating ? Math.round(seededFloat(seed + 51, 3.4, 4.85) * 100) / 100 : null
    const baseCount = hasRating ? seededInt(seed + 52, 12, 840) : null

    services.push({
      serviceId: `${operatorSlug(operatorName)}-${si}`,
      serviceLabel,
      departureTime,
      scrapedOperatorName: operatorName,
      canonicalOperatorId: canonicalId,
      snapshotsByDate: buildServiceSnapshots(seed, dates, baseRating, baseCount),
    })
  }
  return services
}

export function buildSrpRouteTree(
  marketplace: MarketplaceId,
  route: MarketplaceRoute,
  dates: string[],
  operatorFilter: string[],
): SrpRouteTree {
  const byCanonical = new Map<string, SrpOperatorBlock>()

  for (const operatorName of operatorFilter) {
    const canonicalId = canonicalOperatorId(operatorName)
    const displayName = canonicalOperatorDisplay(operatorName)
    const services = buildServicesForOperator(marketplace, route, operatorName, dates)

    const existing = byCanonical.get(canonicalId)
    if (existing) {
      existing.scrapedNames.push(operatorName)
      existing.services.push(...services)
    } else {
      byCanonical.set(canonicalId, {
        canonicalId,
        displayName,
        scrapedNames: [operatorName],
        services,
      })
    }
  }

  return {
    routeKey: route.key,
    routeLabel: route.label,
    operators: [...byCanonical.values()],
  }
}

export function buildSrpRouteBlock(
  marketplace: MarketplaceId,
  route: MarketplaceRoute,
  operatorName: string,
  dates: string[],
): SrpRouteBlock {
  return {
    routeKey: route.key,
    routeLabel: route.label,
    operator: operatorName,
    services: buildServicesForOperator(marketplace, route, operatorName, dates),
  }
}

export function buildSrpRouteBlocks(
  marketplace: MarketplaceId,
  route: MarketplaceRoute,
  dates: string[],
  operatorFilter: string[],
): SrpRouteBlock[] {
  return operatorFilter.map(op => buildSrpRouteBlock(marketplace, route, op, dates))
}

export function buildSrpGrid(
  marketplace: MarketplaceId,
  route: MarketplaceRoute,
  dates: string[],
  operatorFilter?: string[],
): SrpTimingRow[] {
  const pool = operatorFilter?.length
    ? route.operators.filter(o => operatorFilter.includes(o))
    : route.operators

  return pool.flatMap(name =>
    buildServicesForOperator(marketplace, route, name, dates).map(svc => ({
      operator: name,
      slug: operatorSlug(name),
      serviceLabel: svc.serviceLabel,
      departureTime: svc.departureTime,
      ranks: Object.fromEntries(
        dates.map(date => {
          const slots = svc.snapshotsByDate[date]
          const vals = SRP_SLOT_KEYS.map(k => slots?.[k]?.srp).filter((v): v is number => v != null)
          const avg = vals.length
            ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
            : null
          return [date, avg]
        }),
      ),
    })),
  )
}

export function networkFreshbusStats(summaries: RouteSummary[]) {
  const ranks = summaries.map(s => s.freshbusRank).filter((r): r is number => r != null)
  const top3 = ranks.filter(r => r <= 3).length
  const avgRank = ranks.length ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10 : null
  return {
    routesTracked: summaries.length,
    avgRank,
    topThreeShare: ranks.length ? Math.round((top3 / ranks.length) * 100) : 0,
    leads: ranks.filter(r => r === 1).length,
  }
}

export function summarizeSrpGrid(grid: SrpTimingRow[], dates: string[]) {
  const byOperator = new Map<string, number[]>()
  grid.forEach(row => {
    const ranks = dates.map(d => row.ranks[d]).filter((r): r is number => r != null)
    if (!byOperator.has(row.operator)) byOperator.set(row.operator, [])
    byOperator.get(row.operator)!.push(...ranks)
  })

  const operatorMedians = [...byOperator.entries()].map(([name, ranks]) => {
    const sorted = [...ranks].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)] ?? null
    const topTenShare = ranks.length ? Math.round((ranks.filter(r => r <= 10).length / ranks.length) * 100) : 0
    return { name, median, topTenShare, samples: ranks.length }
  })

  operatorMedians.sort((a, b) => (a.median ?? 999) - (b.median ?? 999))

  const freshbus = operatorMedians.find(o => isFreshBus(o.name))
  const leader = operatorMedians[0]

  return { operatorMedians, freshbus, leader, totalSamples: grid.length }
}
