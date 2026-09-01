import {
  displayOperatorName,
  isFreshBus,
  marketplaceRoutes,
  type MarketplaceId,
  type MarketplaceRoute,
} from './marketplaceConfig'
import { buildSrpRouteTree, type SrpRouteTree, type SrpServiceRecord } from './marketplaceMockData'
import type { SnapshotSlotFilter } from './marketplaceConstants'
import {
  SRP_SLOT_KEYS,
  type SrpSlotKey,
  averageSrpForService,
  observationsForService,
} from './srpAnalytics'
import {
  completedSnapshotSlotsForDate,
  datesForPeriod,
  resolveComparisonRange,
  type PeriodRange,
} from './periodPresets'

export interface AnalyticsScope {
  marketplace: MarketplaceId
  routes: MarketplaceRoute[]
  operators: string[]
  periodRange: PeriodRange
  snapshot: SnapshotSlotFilter
  compareEnabled: boolean
}

function hashSeed(...parts: string[]) {
  let h = 2166136261
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) h = Math.imul(h ^ p.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

function seededInt(seed: number, min: number, max: number) {
  const x = Math.sin(seed) * 10000
  const f = x - Math.floor(x)
  return Math.round(min + f * (max - min))
}

function slotsForFilter(snapshot: SnapshotSlotFilter, date: string): SrpSlotKey[] {
  const completed = completedSnapshotSlotsForDate(date)
  const pool = snapshot === 'all' ? completed : completed.filter(s => s === snapshot)
  return pool.length ? pool : completed.slice(0, 1)
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function mockFare(marketplace: MarketplaceId, routeKey: string, serviceId: string): number {
  return seededInt(hashSeed(marketplace, routeKey, serviceId, 'fare'), 699, 1899)
}

function collectRanks(
  trees: SrpRouteTree[],
  dates: string[],
  snapshot: SnapshotSlotFilter,
  freshbusOnly = false,
): number[] {
  const ranks: number[] = []
  for (const tree of trees) {
    for (const op of tree.operators) {
      if (freshbusOnly && !isFreshBus(op.displayName) && !op.scrapedNames.some(isFreshBus)) continue
      for (const svc of op.services) {
        for (const date of dates) {
          for (const slot of slotsForFilter(snapshot, date)) {
            const rank = svc.snapshotsByDate[date]?.[slot]?.srp
            if (rank != null) ranks.push(rank)
          }
        }
      }
    }
  }
  return ranks
}

function collectServiceAvgRanks(
  trees: SrpRouteTree[],
  dates: string[],
  snapshot: SnapshotSlotFilter,
  freshbusOnly = false,
): { serviceId: string; avg: number; operator: string; routeLabel: string }[] {
  const out: { serviceId: string; avg: number; operator: string; routeLabel: string }[] = []
  for (const tree of trees) {
    for (const op of tree.operators) {
      const fb = isFreshBus(op.displayName) || op.scrapedNames.some(isFreshBus)
      if (freshbusOnly && !fb) continue
      for (const svc of op.services) {
        const avg = averageSrpForService(svc, dates, snapshot === 'all' ? undefined : snapshot)
        if (avg != null) {
          out.push({
            serviceId: svc.serviceId,
            avg,
            operator: displayOperatorName(op.displayName),
            routeLabel: tree.routeLabel,
          })
        }
      }
    }
  }
  return out
}

function buildTrees(scope: AnalyticsScope, dates: string[]): SrpRouteTree[] {
  if (!scope.routes.length || !scope.operators.length) return []
  return scope.routes.map(r => buildSrpRouteTree(scope.marketplace, r, dates, scope.operators))
}

function activeCounts(trees: SrpRouteTree[], dates: string[], snapshot: SnapshotSlotFilter) {
  const latestDate = dates[dates.length - 1]
  if (!latestDate) return { routes: 0, operators: 0, services: 0 }
  const slots = slotsForFilter(snapshot, latestDate)
  const routeSet = new Set<string>()
  const operatorSet = new Set<string>()
  const serviceSet = new Set<string>()

  for (const tree of trees) {
    let routeActive = false
    for (const op of tree.operators) {
      let opActive = false
      for (const svc of op.services) {
        for (const slot of slots) {
          const rank = svc.snapshotsByDate[latestDate]?.[slot]?.srp
          if (rank != null) {
            serviceSet.add(svc.serviceId)
            opActive = true
          }
        }
      }
      if (opActive) {
        operatorSet.add(op.canonicalId)
        routeActive = true
      }
    }
    if (routeActive) routeSet.add(tree.routeKey)
  }

  return {
    routes: routeSet.size,
    operators: operatorSet.size,
    services: serviceSet.size,
  }
}

export interface RankComparison {
  current: number | null
  previous: number | null
  positionsBetter: number | null
  unavailable?: boolean
}

export function compareRank(current: number | null, previous: number | null): RankComparison {
  if (current == null) return { current, previous, positionsBetter: null }
  if (previous == null) return { current, previous, positionsBetter: null, unavailable: true }
  return { current, previous, positionsBetter: Math.round((previous - current) * 10) / 10 }
}

export interface MarketplacePulseMetrics {
  activeServices: number
  activeOperators: number
  activeRoutes: number
  avgSrpRank: number | null
  top10Services: number
  avgFare: number | null
  context: {
    scale: string
    srp: string
    fare: string
  }
  comparisons: {
    avgSrp: RankComparison
    top10: { current: number; previous: number | null; delta: number | null }
    avgFare: { current: number | null; previous: number | null; pct: number | null }
  }
}

export function buildMarketplacePulse(scope: AnalyticsScope): MarketplacePulseMetrics {
  const dates = datesForPeriod(scope.periodRange)
  const trees = buildTrees(scope, dates)
  const active = activeCounts(trees, dates, scope.snapshot)
  const fbRanks = collectRanks(trees, dates, scope.snapshot, true)
  const fbServices = collectServiceAvgRanks(trees, dates, scope.snapshot, true)
  const top10 = fbServices.filter(s => s.avg <= 10).length

  let fareSum = 0
  let fareN = 0
  for (const tree of trees) {
    for (const op of tree.operators) {
      if (!isFreshBus(op.displayName) && !op.scrapedNames.some(isFreshBus)) continue
      for (const svc of op.services) {
        const f = mockFare(scope.marketplace, tree.routeKey, svc.serviceId)
        fareSum += f
        fareN++
      }
    }
  }

  const compareRange = scope.compareEnabled ? resolveComparisonRange(scope.periodRange) : null
  const compareDates = compareRange ? datesForPeriod(compareRange) : []
  const prevTrees = compareDates.length ? buildTrees(scope, compareDates) : []
  const prevFbRanks = prevTrees.length ? collectRanks(prevTrees, compareDates, scope.snapshot, true) : []
  const prevFbServices = prevTrees.length
    ? collectServiceAvgRanks(prevTrees, compareDates, scope.snapshot, true)
    : []
  const prevTop10 = prevFbServices.filter(s => s.avg <= 10).length

  let prevFareSum = 0
  let prevFareN = 0
  if (prevTrees.length) {
    for (const tree of prevTrees) {
      for (const op of tree.operators) {
        if (!isFreshBus(op.displayName) && !op.scrapedNames.some(isFreshBus)) continue
        for (const svc of op.services) {
          prevFareSum += mockFare(scope.marketplace, tree.routeKey, svc.serviceId)
          prevFareN++
        }
      }
    }
  }

  const avgSrp = mean(fbRanks)
  const prevAvgSrp = mean(prevFbRanks)
  const avgFare = fareN ? Math.round(fareSum / fareN) : null
  const prevAvgFare = prevFareN ? Math.round(prevFareSum / prevFareN) : null
  const farePct =
    avgFare != null && prevAvgFare != null && prevAvgFare > 0
      ? Math.round(((avgFare - prevAvgFare) / prevAvgFare) * 1000) / 10
      : null

  const latestSlot =
    scope.snapshot === 'all'
      ? completedSnapshotSlotsForDate(dates[dates.length - 1] ?? '').slice(-1)[0] ?? 'latest'
      : scope.snapshot

  return {
    activeServices: active.services,
    activeOperators: active.operators,
    activeRoutes: active.routes,
    avgSrpRank: avgSrp,
    top10Services: top10,
    avgFare,
    context: {
      scale: `Latest snapshot · ${latestSlot} IST`,
      srp: `${scope.periodRange.label} · all snapshots`,
      fare: `${scope.periodRange.label} · FreshBus services`,
    },
    comparisons: {
      avgSrp: compareRank(avgSrp, prevAvgSrp),
      top10: {
        current: top10,
        previous: compareRange ? prevTop10 : null,
        delta: compareRange ? top10 - prevTop10 : null,
      },
      avgFare: { current: avgFare, previous: prevAvgFare, pct: farePct },
    },
  }
}

export type TrendMetric = 'avg_srp' | 'avg_fare' | 'active_services' | 'active_operators'

export interface TrendPoint {
  label: string
  value: number | null
}

export function buildMarketplaceTrend(
  scope: AnalyticsScope,
  metric: TrendMetric,
): TrendPoint[] {
  const dates = datesForPeriod(scope.periodRange)
  const isToday = scope.periodRange.preset === 'today' && dates.length === 1

  if (isToday) {
    const date = dates[0]!
    const slots = completedSnapshotSlotsForDate(date)
    return slots.map(slot => {
      const trees = buildTrees(scope, [date])
      if (metric === 'avg_srp') {
        return { label: slot, value: mean(collectRanks(trees, [date], slot, true)) }
      }
      if (metric === 'active_services' || metric === 'active_operators') {
        const c = activeCounts(trees, [date], slot)
        return {
          label: slot,
          value: metric === 'active_services' ? c.services : c.operators,
        }
      }
      let sum = 0
      let n = 0
      for (const tree of trees) {
        for (const op of tree.operators) {
          if (!isFreshBus(op.displayName)) continue
          for (const svc of op.services) {
            sum += mockFare(scope.marketplace, tree.routeKey, svc.serviceId)
            n++
          }
        }
      }
      return { label: slot, value: n ? Math.round(sum / n) : null }
    })
  }

  return dates.map(date => {
    const trees = buildTrees(scope, [date])
    const label = date.slice(8, 10) + '/' + date.slice(5, 7)
    if (metric === 'avg_srp') {
      return { label, value: mean(collectRanks(trees, [date], scope.snapshot, true)) }
    }
    if (metric === 'active_services' || metric === 'active_operators') {
      const c = activeCounts(trees, [date], scope.snapshot)
      return {
        label,
        value: metric === 'active_services' ? c.services : c.operators,
      }
    }
    let sum = 0
    let n = 0
    for (const tree of trees) {
      for (const op of tree.operators) {
        if (!isFreshBus(op.displayName)) continue
        for (const svc of op.services) {
          sum += mockFare(scope.marketplace, tree.routeKey, svc.serviceId)
          n++
        }
      }
    }
    return { label, value: n ? Math.round(sum / n) : null }
  })
}

export interface HeatmapRow {
  routeLabel: string
  routeKey: string
  cells: { slot: SrpSlotKey; operators: number; services: number }[]
}

export function buildRouteCompetitionHeatmap(scope: AnalyticsScope): HeatmapRow[] {
  const dates = datesForPeriod(scope.periodRange)
  const latestDate = dates[dates.length - 1]
  if (!latestDate) return []

  return scope.routes.map(route => {
    const tree = buildSrpRouteTree(scope.marketplace, route, [latestDate], route.operators)
    const cells = SRP_SLOT_KEYS.map(slot => {
      const opSet = new Set<string>()
      let services = 0
      for (const op of tree.operators) {
        let opActive = false
        for (const svc of op.services) {
          if (svc.snapshotsByDate[latestDate]?.[slot]?.srp != null) {
            services++
            opActive = true
          }
        }
        if (opActive) opSet.add(op.canonicalId)
      }
      return { slot, operators: opSet.size, services }
    })
    return { routeLabel: route.label, routeKey: route.key, cells }
  })
}

export interface ChangeInsight {
  direction: 'up' | 'down' | 'neutral'
  text: string
}

export function buildWhatChanged(scope: AnalyticsScope): ChangeInsight[] {
  const pulse = buildMarketplacePulse(scope)
  const insights: ChangeInsight[] = []
  const cmp = pulse.comparisons.avgSrp
  if (cmp.positionsBetter != null && cmp.positionsBetter !== 0) {
    insights.push({
      direction: cmp.positionsBetter > 0 ? 'up' : 'down',
      text:
        cmp.positionsBetter > 0
          ? `FreshBus average SRP improved by ${Math.abs(cmp.positionsBetter)} positions across selected services.`
          : `FreshBus average SRP declined by ${Math.abs(cmp.positionsBetter)} positions across selected services.`,
    })
  }
  const topDelta = pulse.comparisons.top10.delta
  if (topDelta != null && topDelta !== 0) {
    insights.push({
      direction: topDelta > 0 ? 'up' : 'down',
      text:
        topDelta > 0
          ? `${topDelta} more FreshBus services entered Top 10.`
          : `${Math.abs(topDelta)} FreshBus services moved out of Top 10.`,
    })
  }
  const heatmap = buildRouteCompetitionHeatmap(scope)
  const busiest = [...heatmap].sort(
    (a, b) =>
      (b.cells.reduce((s, c) => s + c.operators, 0) || 0) -
      (a.cells.reduce((s, c) => s + c.operators, 0) || 0),
  )[0]
  if (busiest) {
    const maxCell = [...busiest.cells].sort((a, c) => c.operators - a.operators)[0]
    if (maxCell && maxCell.operators >= 15) {
      insights.push({
        direction: 'up',
        text: `Competition peaks at ${maxCell.operators} operators on ${busiest.routeLabel} (${maxCell.slot} IST).`,
      })
    }
  }
  return insights.slice(0, 5)
}

export interface RouteLeaderboardRow {
  routeKey: string
  routeLabel: string
  operators: number
  services: number
  freshbusServices: number
  freshbusAvgSrp: number | null
  srpChange: RankComparison
}

export function buildRouteLeaderboard(scope: AnalyticsScope): RouteLeaderboardRow[] {
  const dates = datesForPeriod(scope.periodRange)
  const compareRange = scope.compareEnabled ? resolveComparisonRange(scope.periodRange) : null
  const compareDates = compareRange ? datesForPeriod(compareRange) : []

  return scope.routes
    .map(route => {
      const tree = buildSrpRouteTree(scope.marketplace, route, dates, route.operators)
      const opSet = new Set<string>()
      let services = 0
      let fbServices = 0
      for (const op of tree.operators) {
        let opActive = false
        const fb = isFreshBus(op.displayName) || op.scrapedNames.some(isFreshBus)
        for (const svc of op.services) {
          const has = dates.some(d =>
            slotsForFilter(scope.snapshot, d).some(
              slot => svc.snapshotsByDate[d]?.[slot]?.srp != null,
            ),
          )
          if (has) {
            services++
            opActive = true
            if (fb) fbServices++
          }
        }
        if (opActive) opSet.add(op.canonicalId)
      }
      const curRank = mean(collectRanks([tree], dates, scope.snapshot, true))
      let prevRank: number | null = null
      if (compareDates.length) {
        const prevTree = buildSrpRouteTree(scope.marketplace, route, compareDates, route.operators)
        prevRank = mean(collectRanks([prevTree], compareDates, scope.snapshot, true))
      }
      return {
        routeKey: route.key,
        routeLabel: route.label,
        operators: opSet.size,
        services,
        freshbusServices: fbServices,
        freshbusAvgSrp: curRank,
        srpChange: compareRank(curRank, prevRank),
      }
    })
    .sort((a, b) => (a.freshbusAvgSrp ?? 999) - (b.freshbusAvgSrp ?? 999))
}

export interface RoutePageKpis {
  routes: number
  avgOperatorsPerRoute: number
  avgServicesPerRoute: number
  freshbusCoverage: { covered: number; total: number }
}

export function buildRoutePageKpis(scope: AnalyticsScope): RoutePageKpis {
  const rows = buildRouteLeaderboard(scope)
  const total = rows.length
  return {
    routes: total,
    avgOperatorsPerRoute: total
      ? Math.round((rows.reduce((s, r) => s + r.operators, 0) / total) * 10) / 10
      : 0,
    avgServicesPerRoute: total
      ? Math.round((rows.reduce((s, r) => s + r.services, 0) / total) * 10) / 10
      : 0,
    freshbusCoverage: {
      covered: rows.filter(r => r.freshbusServices > 0).length,
      total,
    },
  }
}

export interface RouteMatrixPoint {
  routeLabel: string
  routeKey: string
  activeOperators: number
  freshbusAvgSrp: number | null
  freshbusServices: number
  srpChange: RankComparison
}

export function buildRouteMatrix(scope: AnalyticsScope): RouteMatrixPoint[] {
  return buildRouteLeaderboard(scope).map(r => ({
    routeLabel: r.routeLabel,
    routeKey: r.routeKey,
    activeOperators: r.operators,
    freshbusAvgSrp: r.freshbusAvgSrp,
    freshbusServices: r.freshbusServices,
    srpChange: r.srpChange,
  }))
}

export interface OperatorLeaderboardRow {
  operatorId: string
  operatorName: string
  routes: number
  services: number
  avgSrp: number | null
  top10Services: number
  avgFare: number | null
  srpChange: RankComparison
  isFreshBus: boolean
}

export function buildOperatorLeaderboard(scope: AnalyticsScope): OperatorLeaderboardRow[] {
  const dates = datesForPeriod(scope.periodRange)
  const compareRange = scope.compareEnabled ? resolveComparisonRange(scope.periodRange) : null
  const compareDates = compareRange ? datesForPeriod(compareRange) : []

  const byOp = new Map<
    string,
    { name: string; routes: Set<string>; ranks: number[]; serviceAvgs: number[]; fares: number[] }
  >()

  for (const route of scope.routes) {
    const tree = buildSrpRouteTree(scope.marketplace, route, dates, route.operators)
    for (const op of tree.operators) {
      const id = op.canonicalId
      if (!byOp.has(id)) {
        byOp.set(id, { name: displayOperatorName(op.displayName), routes: new Set(), ranks: [], serviceAvgs: [], fares: [] })
      }
      const row = byOp.get(id)!
      row.routes.add(route.key)
      for (const svc of op.services) {
        const obs = observationsForService(svc, dates, scope.snapshot === 'all' ? undefined : scope.snapshot)
        obs.forEach(o => row.ranks.push(o.srp))
        const avg = averageSrpForService(svc, dates, scope.snapshot === 'all' ? undefined : scope.snapshot)
        if (avg != null) row.serviceAvgs.push(avg)
        row.fares.push(mockFare(scope.marketplace, route.key, svc.serviceId))
      }
    }
  }

  const prevByOp = new Map<string, number[]>()
  if (compareDates.length) {
    for (const route of scope.routes) {
      const tree = buildSrpRouteTree(scope.marketplace, route, compareDates, route.operators)
      for (const op of tree.operators) {
        if (!prevByOp.has(op.canonicalId)) prevByOp.set(op.canonicalId, [])
        for (const svc of op.services) {
          const obs = observationsForService(svc, compareDates, scope.snapshot === 'all' ? undefined : scope.snapshot)
          obs.forEach(o => prevByOp.get(op.canonicalId)!.push(o.srp))
        }
      }
    }
  }

  const rows: OperatorLeaderboardRow[] = [...byOp.entries()].map(([id, data]) => {
    const top10 = data.serviceAvgs.filter(a => a <= 10).length
    const cur = mean(data.ranks)
    const prev = mean(prevByOp.get(id) ?? [])
    return {
      operatorId: id,
      operatorName: data.name,
      routes: data.routes.size,
      services: data.serviceAvgs.length,
      avgSrp: cur,
      top10Services: top10,
      avgFare: mean(data.fares),
      srpChange: compareRank(cur, prev),
      isFreshBus: isFreshBus(data.name),
    }
  })

  rows.sort((a, b) => {
    if (a.isFreshBus && !b.isFreshBus) return -1
    if (!a.isFreshBus && b.isFreshBus) return 1
    return (a.avgSrp ?? 999) - (b.avgSrp ?? 999)
  })
  return rows
}

export interface OperatorMatrixPoint {
  operatorName: string
  medianFare: number | null
  avgSrp: number | null
  activeServices: number
  activeRoutes: number
  top10Services: number
  isFreshBus: boolean
}

export function buildOperatorMatrix(scope: AnalyticsScope): OperatorMatrixPoint[] {
  return buildOperatorLeaderboard(scope).map(r => ({
    operatorName: r.operatorName,
    medianFare: r.avgFare,
    avgSrp: r.avgSrp,
    activeServices: r.services,
    activeRoutes: r.routes,
    top10Services: r.top10Services,
    isFreshBus: r.isFreshBus,
  }))
}

export interface SrpBandDistribution {
  top10: number
  band11_30: number
  band31_100: number
  band100plus: number
  total: number
}

export function buildSrpBandDistribution(scope: AnalyticsScope, freshbusOnly = true): SrpBandDistribution {
  const dates = datesForPeriod(scope.periodRange)
  const trees = buildTrees(scope, dates)
  const avgs = collectServiceAvgRanks(trees, dates, scope.snapshot, freshbusOnly)
  const dist = { top10: 0, band11_30: 0, band31_100: 0, band100plus: 0, total: avgs.length }
  avgs.forEach(s => {
    if (s.avg <= 10) dist.top10++
    else if (s.avg <= 30) dist.band11_30++
    else if (s.avg <= 100) dist.band31_100++
    else dist.band100plus++
  })
  return dist
}

export interface SrpStabilityRow {
  serviceId: string
  serviceLabel: string
  routeLabel: string
  avgSrp: number | null
  bestRank: number | null
  worstRank: number | null
  volatility: 'Low' | 'Medium' | 'High'
  stdDev: number | null
  top10Days: number
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const m = values.reduce((a, b) => a + b, 0) / values.length
  const v = values.reduce((s, x) => s + (x - m) ** 2, 0) / values.length
  return Math.round(Math.sqrt(v) * 10) / 10
}

function volatilityLabel(sd: number | null): 'Low' | 'Medium' | 'High' {
  if (sd == null) return 'Low'
  if (sd <= 3) return 'Low'
  if (sd <= 8) return 'Medium'
  return 'High'
}

export function buildSrpStability(scope: AnalyticsScope): SrpStabilityRow[] {
  const dates = datesForPeriod(scope.periodRange)
  const trees = buildTrees(scope, dates)
  const rows: SrpStabilityRow[] = []

  for (const tree of trees) {
    for (const op of tree.operators) {
      if (!isFreshBus(op.displayName) && !op.scrapedNames.some(isFreshBus)) continue
      for (const svc of op.services) {
        const obs = observationsForService(svc, dates, scope.snapshot === 'all' ? undefined : scope.snapshot)
        const ranks = obs.map(o => o.srp)
        const avg = mean(ranks)
        const sd = stdDev(ranks)
        const top10Days = dates.filter(d => {
          const dayRanks = slotsForFilter(scope.snapshot, d)
            .map(slot => svc.snapshotsByDate[d]?.[slot]?.srp)
            .filter((v): v is number => v != null)
          const dayAvg = mean(dayRanks)
          return dayAvg != null && dayAvg <= 10
        }).length
        rows.push({
          serviceId: svc.serviceId,
          serviceLabel: svc.serviceLabel,
          routeLabel: tree.routeLabel,
          avgSrp: avg,
          bestRank: ranks.length ? Math.min(...ranks) : null,
          worstRank: ranks.length ? Math.max(...ranks) : null,
          volatility: volatilityLabel(sd),
          stdDev: sd,
          top10Days,
        })
      }
    }
  }

  return rows.sort((a, b) => (a.avgSrp ?? 999) - (b.avgSrp ?? 999)).slice(0, 20)
}

export interface IntradayRow {
  serviceLabel: string
  routeLabel: string
  slots: Record<SrpSlotKey, number | null>
}

export function buildIntradayGrid(scope: AnalyticsScope): IntradayRow[] {
  const dates = datesForPeriod(scope.periodRange)
  const date = dates[dates.length - 1]
  if (!date) return []
  const trees = buildTrees(scope, [date])
  const rows: IntradayRow[] = []

  for (const tree of trees) {
    for (const op of tree.operators) {
      if (!isFreshBus(op.displayName) && !op.scrapedNames.some(isFreshBus)) continue
      for (const svc of op.services) {
        const slots = {} as Record<SrpSlotKey, number | null>
        SRP_SLOT_KEYS.forEach(slot => {
          slots[slot] = svc.snapshotsByDate[date]?.[slot]?.srp ?? null
        })
        rows.push({ serviceLabel: svc.serviceLabel, routeLabel: tree.routeLabel, slots })
      }
    }
  }
  return rows.slice(0, 15)
}

export function buildSrpSummary(scope: AnalyticsScope) {
  const dates = datesForPeriod(scope.periodRange)
  const trees = buildTrees(scope, dates)
  const fbRanks = collectRanks(trees, dates, scope.snapshot, true)
  const avgs = collectServiceAvgRanks(trees, dates, scope.snapshot, true)
  return {
    avgSrp: mean(fbRanks),
    top10: avgs.filter(s => s.avg <= 10).length,
    top30: avgs.filter(s => s.avg <= 30).length,
    band100plus: avgs.filter(s => s.avg > 100).length,
  }
}

export function allMarketplaceRoutes() {
  return marketplaceRoutes()
}

export type { SrpServiceRecord }
