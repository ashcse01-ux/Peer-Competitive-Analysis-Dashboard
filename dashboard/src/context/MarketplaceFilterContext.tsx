import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { marketplaceRoutes, type MarketplaceRoute } from '../lib/marketplaceConfig'
import {
  COMPARE_LABELS,
  MARKETPLACE_DATA_START,
  type ComparePreset,
  type SnapshotSlotFilter,
} from '../lib/marketplaceConstants'
import {
  datesForPeriod,
  latestAvailableDate,
  periodPresetLabel,
  resolvePeriodRange,
  type PeriodPreset,
  type PeriodRange,
} from '../lib/periodPresets'

export interface MarketplaceFilterState {
  selectedRouteKeys: string[]
  selectedOperators: string[]
  period: PeriodPreset
  customStart: string
  customEnd: string
  compare: ComparePreset
  snapshot: SnapshotSlotFilter
  periodRange: PeriodRange
  dates: string[]
  routes: MarketplaceRoute[]
  availableOperators: string[]
  selectedRoutes: MarketplaceRoute[]
  allRoutesSelected: boolean
  allOperatorsSelected: boolean
  setSelectedRouteKeys: (keys: string[]) => void
  setSelectedOperators: (ops: string[]) => void
  setPeriod: (p: PeriodPreset) => void
  setCustomStart: (d: string) => void
  setCustomEnd: (d: string) => void
  setCompare: (c: ComparePreset) => void
  setSnapshot: (s: SnapshotSlotFilter) => void
  clearAll: () => void
}

const MarketplaceFilterContext = createContext<MarketplaceFilterState | null>(null)

export function MarketplaceFilterProvider({ children }: { children: React.ReactNode }) {
  const routes = useMemo(() => marketplaceRoutes(), [])
  const allRouteKeys = useMemo(() => routes.map(r => r.key), [routes])

  const [selectedRouteKeys, setSelectedRouteKeys] = useState<string[]>(() => [...allRouteKeys])
  const [selectedOperators, setSelectedOperators] = useState<string[]>(() => {
    const set = new Set<string>()
    routes.forEach(r => r.operators.forEach(o => set.add(o)))
    return [...set].sort()
  })
  const [period, setPeriod] = useState<PeriodPreset>('tomorrow')
  const [customStart, setCustomStart] = useState(MARKETPLACE_DATA_START)
  const [customEnd, setCustomEnd] = useState(latestAvailableDate())
  const [compare, setCompare] = useState<ComparePreset>('previous_period')
  const [snapshot, setSnapshot] = useState<SnapshotSlotFilter>('all')

  const selectedRoutes = useMemo(
    () => routes.filter(r => selectedRouteKeys.includes(r.key)),
    [routes, selectedRouteKeys],
  )

  const availableOperators = useMemo(() => {
    const set = new Set<string>()
    selectedRoutes.forEach(r => r.operators.forEach(o => set.add(o)))
    return [...set].sort()
  }, [selectedRoutes])

  const periodRange = useMemo(
    () => resolvePeriodRange(period, customStart, customEnd),
    [period, customStart, customEnd],
  )

  const dates = useMemo(() => datesForPeriod(periodRange), [periodRange])

  const allRoutesSelected = selectedRouteKeys.length === allRouteKeys.length
  const allOperatorsSelected =
    availableOperators.length > 0 && selectedOperators.length === availableOperators.length

  const handleSetRoutes = useCallback(
    (keys: string[]) => {
      setSelectedRouteKeys(keys.length ? keys : allRouteKeys)
      const nextRoutes = routes.filter(r => (keys.length ? keys : allRouteKeys).includes(r.key))
      const ops = new Set<string>()
      nextRoutes.forEach(r => r.operators.forEach(o => ops.add(o)))
      const union = [...ops].sort()
      setSelectedOperators(prev => {
        const kept = prev.filter(o => union.includes(o))
        return kept.length ? kept : union
      })
    },
    [routes, allRouteKeys],
  )

  const clearAll = useCallback(() => {
    setSelectedRouteKeys([...allRouteKeys])
    const ops = new Set<string>()
    routes.forEach(r => r.operators.forEach(o => ops.add(o)))
    setSelectedOperators([...ops].sort())
    setPeriod('tomorrow')
    setCustomStart(MARKETPLACE_DATA_START)
    setCustomEnd(latestAvailableDate())
    setCompare('previous_period')
    setSnapshot('all')
  }, [allRouteKeys, routes])

  const value = useMemo<MarketplaceFilterState>(
    () => ({
      selectedRouteKeys,
      selectedOperators,
      period,
      customStart,
      customEnd,
      compare,
      snapshot,
      periodRange,
      dates,
      routes,
      availableOperators,
      selectedRoutes,
      allRoutesSelected,
      allOperatorsSelected,
      setSelectedRouteKeys: handleSetRoutes,
      setSelectedOperators,
      setPeriod,
      setCustomStart,
      setCustomEnd,
      setCompare,
      setSnapshot,
      clearAll,
    }),
    [
      selectedRouteKeys,
      selectedOperators,
      period,
      customStart,
      customEnd,
      compare,
      snapshot,
      periodRange,
      dates,
      routes,
      availableOperators,
      selectedRoutes,
      allRoutesSelected,
      allOperatorsSelected,
      handleSetRoutes,
      clearAll,
    ],
  )

  return (
    <MarketplaceFilterContext.Provider value={value}>{children}</MarketplaceFilterContext.Provider>
  )
}

export function useMarketplaceFilters() {
  const ctx = useContext(MarketplaceFilterContext)
  if (!ctx) throw new Error('useMarketplaceFilters must be used within MarketplaceFilterProvider')
  return ctx
}

export { COMPARE_LABELS }
