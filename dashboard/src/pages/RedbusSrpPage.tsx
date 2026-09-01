import React, { useMemo } from 'react'
import SrpScraperTestFilterBar from '../components/SrpScraperTestFilterBar'
import { useMarketplaceFilters } from '../context/MarketplaceFilterContext'
import { useRedbusSrp } from '../api'
import { redbusSrpRouteLabel } from '../lib/redbusRoutes'

export default function RedbusSrpPage() {
  const filters = useMarketplaceFilters()
  
  // Get the selected route string
  const routeObj = filters.selectedRoutes[0]
  const routeString = routeObj 
    ? redbusSrpRouteLabel(...routeObj.key.split('|') as [string, string])
    : 'Hyderabad → Vijayawada'
  
  const { data, isLoading, error } = useRedbusSrp(undefined, routeString, filters.customStart, filters.customEnd)

  const filteredData = useMemo(() => {
    if (!data?.data) return []
    let rows = data.data
    if (filters.selectedOperators.length > 0) {
      rows = rows.filter(row => filters.selectedOperators.includes(row.operator))
    }
    return rows
  }, [data, filters.selectedOperators])

  return (
    <div className="analytics-page flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="section-title text-2xl">Scraper Test Dashboard</h2>
        <p className="text-sm font-medium text-theme-secondary">Raw data viewer for Redbus SRP scraper.</p>
      </header>

      <SrpScraperTestFilterBar />

      <section className="analytics-panel">
        <h3 className="text-lg font-bold mb-4">Raw Scraper Data</h3>
        
        {isLoading && <div className="p-8 text-center text-theme-muted">Loading data...</div>}
        {error && <div className="p-8 text-center text-red-500">Error loading data.</div>}
        
        {!isLoading && !error && (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Operator</th>
                  <th>Timing</th>
                  <th>Bus Type</th>
                  <th>Price</th>
                  <th>Rating (Reviews)</th>
                  <th>Avg SRP Rank</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-theme-muted">
                      No data found for the selected dates and operators.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((row, idx) => {
                    // Calculate average rank from snapshots if needed, or just show the first one
                    const slots = Object.values(row.snapshots || {})
                    const avgRank = slots.length > 0 
                      ? Math.round(slots.reduce((a, b) => a + b, 0) / slots.length) 
                      : 'N/A'

                    return (
                      <tr key={`${row.service_key}-${idx}`}>
                        <td className="text-xs text-theme-muted">{row.route}</td>
                        <td className="font-semibold">{row.operator}</td>
                        <td>{row.timing}</td>
                        <td className="text-xs">{row.bus_type || '—'}</td>
                        <td className="tabular-nums font-medium">{row.price || '—'}</td>
                        <td>
                          {row.rating && row.rating !== '0' ? (
                            <span>⭐ {row.rating} <span className="text-xs text-theme-muted">({row.reviews || '0'})</span></span>
                          ) : (
                            <span className="text-theme-muted text-xs">No rating</span>
                          )}
                        </td>
                        <td className="tabular-nums text-center font-bold">
                          {avgRank !== 'N/A' ? `#${avgRank}` : '—'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
