import React, { useMemo } from 'react'
import { Bus, CalendarRange, Compass, Layers, Route } from 'lucide-react'
import SrpHierarchicalTable from './SrpHierarchicalTable'
import SrpLegendBar from './SrpLegendBar'
import { useMarketplaceFilters } from '../context/MarketplaceFilterContext'
import { MARKETPLACE_BRAND, type MarketplaceId } from '../lib/marketplaceConfig'
import { buildSrpRouteTree } from '../lib/marketplaceMockData'
import { useRedbusSrp, type RedbusSrpEntry } from '../api'
import { operatorSlug } from '../lib/marketplaceConfig'
import { completedSnapshotSlotsForDate } from '../lib/periodPresets'

interface Props {
  marketplace: MarketplaceId
  /** When true, hide duplicate page hero (used inside Redbus SRP page). */
  embedded?: boolean
}

function StatChip({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="srp-stat-chip">
      <div
        className="srp-stat-chip-icon"
        style={accent ? { color: accent, background: `${accent}14` } : undefined}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="srp-stat-chip-label">{label}</p>
        <p className="srp-stat-chip-value">{value}</p>
      </div>
    </div>
  )
}


import { redbusSrpRouteLabel } from '../lib/redbusRoutes'

function transformSrpData(apiData: RedbusSrpEntry[], selectedRoutes: import('../lib/marketplaceConfig').MarketplaceRoute[], selectedOperators: string[]): any[] {
  const treeMap = new Map<string, any>()
  
  const routeArrows = selectedRoutes.map(r => redbusSrpRouteLabel(r.origin, r.destination))

  for (const entry of apiData) {
    if (routeArrows.length && !routeArrows.includes(entry.route)) continue;
    
    const opName = entry.operator;
    if (selectedOperators.length && !selectedOperators.includes(opName)) continue;

    const slug = operatorSlug(opName);

    if (!treeMap.has(entry.route)) {
      treeMap.set(entry.route, [])
    }
    const operators = treeMap.get(entry.route)!

    let opBlock = operators.find((o: any) => o.canonicalId === slug)
    if (!opBlock) {
      opBlock = {
        canonicalId: slug,
        displayName: opName,
        scrapedNames: [opName],
        services: []
      }
      operators.push(opBlock)
    }

    const serviceRecord = {
      serviceId: String(entry.service_key),
      serviceLabel: entry.service_number,
      departureTime: entry.timing,
      scrapedOperatorName: opName,
      canonicalOperatorId: slug,
      snapshotsByDate: {} as Record<string, Record<string, number>>
    }

    for (const [dateStr, rank] of Object.entries(entry.snapshots)) {
      serviceRecord.snapshotsByDate[dateStr] = {
        '11am': rank
      }
    }

    opBlock.services.push(serviceRecord)
  }

  const trees = []
  for (const [routeLabel, operators] of treeMap.entries()) {
    const matchedRoute = selectedRoutes.find(r => redbusSrpRouteLabel(r.origin, r.destination) === routeLabel);
    trees.push({
      routeKey: matchedRoute ? matchedRoute.key : routeLabel,
      routeLabel: matchedRoute ? matchedRoute.label : routeLabel,
      operators
    })
  }

  return trees
}

export default function MarketplaceSrpDashboard({ marketplace, embedded = false }: Props) {
  const brand = MARKETPLACE_BRAND[marketplace]
  const {
    selectedRoutes,
    selectedOperators,
    dates,
    periodRange,
    period,
  } = useMarketplaceFilters()

  const srpQuery = useRedbusSrp('', '')
  const trees = useMemo(() => {
    if (!srpQuery.data) return []
    return transformSrpData(srpQuery.data.data, selectedRoutes, selectedOperators)
  }, [srpQuery.data, selectedRoutes, selectedOperators])

  const slotAvailability = useMemo(() => {
    if (period !== 'today') return undefined
    return (date: string) => completedSnapshotSlotsForDate(date)
  }, [period])

  const totalServices = trees.reduce(
    (n, t) => n + t.operators.reduce((s: number, o: any) => s + o.services.length, 0),
    0,
  )
  const totalOperators = trees.reduce((n, t) => n + t.operators.length, 0)

  return (
    <div className="srp-page flex flex-col gap-5">
      {embedded ? (
        <header className="space-y-1">
          <h3 className="section-title text-lg">Detailed SRP Workbook</h3>
          <p className="text-sm font-medium text-theme-secondary">
            Expand Month → Weeks → Dates → snapshot slots for exact ranks.
          </p>
        </header>
      ) : (
      <header className="srp-page-hero">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="panel-kicker flex items-center gap-2">
              <Compass size={14} style={{ color: brand.accent }} />
              SRP Tracker
            </p>
            <h2 className="section-title text-2xl sm:text-[1.65rem]">Search rank workbook</h2>
            <p className="max-w-2xl text-sm font-medium leading-relaxed text-theme-secondary">
              One workbook for all selected routes. Collapse routes and operators with chevrons. Time columns drill
              <strong className="font-bold text-theme-primary"> Month → Weeks → Dates → 5am·11am·5pm·11pm</strong>.
            </p>
          </div>
          {trees.length > 0 ? (
            <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:w-auto">
              <StatChip icon={<Route size={16} />} label="Routes" value={String(trees.length)} accent={brand.accent} />
              <StatChip icon={<Layers size={16} />} label="Operators" value={String(totalOperators)} accent={brand.accent} />
              <StatChip icon={<Bus size={16} />} label="Services" value={String(totalServices)} accent={brand.accent} />
              <StatChip icon={<CalendarRange size={16} />} label="Period" value={`${dates.length}d`} accent={brand.accent} />
            </div>
          ) : null}
        </div>
        {trees.length > 0 ? (
          <p className="mt-3 text-xs font-semibold text-theme-muted">{periodRange.label}</p>
        ) : null}
      </header>
      )}

      {selectedOperators.length === 0 ? (
        <div className="srp-empty-state">
          <Compass size={40} strokeWidth={1.5} className="text-theme-muted/50" />
          <h3 className="text-lg font-extrabold text-theme-primary">Pick operators to compare</h3>
          <p className="max-w-md text-sm font-medium text-theme-secondary">
            Use the operator filter above to include FreshBus, FlixBus, NueGo, and other tracked peers in the grid.
          </p>
        </div>
      ) : trees.length === 0 ? (
        <div className="srp-empty-state">
          <Route size={40} strokeWidth={1.5} className="text-theme-muted/50" />
          <h3 className="text-lg font-extrabold text-theme-primary">Select at least one route</h3>
          <p className="max-w-md text-sm font-medium text-theme-secondary">
            Choose corridors from the route filter to load the SRP hierarchy for your selected period.
          </p>
        </div>
      ) : (
        <>
          <SrpLegendBar />
          <SrpHierarchicalTable
            trees={trees}
            dates={dates}
            accent={brand.accent}
            slotAvailability={slotAvailability}
          />
        </>
      )}
    </div>
  )
}
