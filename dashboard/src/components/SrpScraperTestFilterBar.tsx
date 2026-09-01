import React, { useState, useMemo } from 'react'
import { useIsFetching } from '@tanstack/react-query'
import MultiSelectOperatorDropdown from './MultiSelectOperatorDropdown'
import { useMarketplaceFilters } from '../context/MarketplaceFilterContext'
import { todayIso, addDaysIso } from '../lib/periodPresets'
import { REDBUS_ROUTE_PAIRS, redbusRouteKey, redbusSrpRouteLabel } from '../lib/redbusRoutes'
import marketplaceRoutesJson from '../data/marketplace-routes.json'

export default function SrpScraperTestFilterBar() {
  const isFetching = useIsFetching({ queryKey: ['redbus-srp'] })
  const isLoading = isFetching > 0
  const { setPeriod, setCustomStart, setCustomEnd, setSelectedRouteKeys, setSelectedOperators, selectedRoutes } = useMarketplaceFilters()
  
  // Try to use the first selected route from context, fallback to Hyderabad-Vijayawada
  const initialRouteObj = selectedRoutes[0]
  const initialRouteKey = initialRouteObj ? initialRouteObj.key : redbusRouteKey('Hyderabad', 'Vijayawada')

  // Local state for the filter bar
  const [localRouteKey, setLocalRouteKey] = useState(initialRouteKey)
  const [startDate, setStartDate] = useState(todayIso())
  const [endDate, setEndDate] = useState(addDaysIso(todayIso(), 1)) // default to tomorrow
  const [operators, setOperators] = useState<string[]>([]) // default empty implies all

  // Compute available operators instantly when route dropdown changes
  const localAvailableOperators = useMemo(() => {
    // marketplaceRoutesJson uses keys like "Hyderabad|Vijayawada"
    const ops = (marketplaceRoutesJson as Record<string, string[]>)[localRouteKey] || []
    return [...ops].sort()
  }, [localRouteKey])

  const handleRouteSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocalRouteKey(e.target.value)
    setOperators([]) // Clear operators when route changes
  }

  const handleGo = () => {
    // Commit to context
    setPeriod('custom')
    setCustomStart(startDate)
    setCustomEnd(endDate)
    setSelectedRouteKeys([localRouteKey])
    
    // Pass empty array to mean "all operators" instead of passing the full list, to avoid filtering out scraped operators not in the JSON.
    setSelectedOperators(operators)
  }

  return (
    <section className="filter-bar-compact bg-amber-50/50 border-amber-200">
      <div className="filter-bar-row flex-wrap items-center">
        <label className="filter-chip-field">
          <span className="filter-field-label">Select Route</span>
          <select 
            className="filter-chip-trigger filter-chip-trigger--select bg-white cursor-pointer"
            value={localRouteKey}
            onChange={handleRouteSelect}
          >
            {REDBUS_ROUTE_PAIRS.map(([o, d]) => (
              <option key={redbusRouteKey(o, d)} value={redbusRouteKey(o, d)}>
                {redbusSrpRouteLabel(o, d)}
              </option>
            ))}
          </select>
        </label>

        <MultiSelectOperatorDropdown
          label="Operator"
          options={localAvailableOperators}
          selected={operators}
          onChange={setOperators}
          searchPlaceholder="Search operators…"
          maxTriggerWidth={132}
          panelWidth={220}
        />

        <label className="filter-chip-field">
          <span className="filter-field-label">Start Date</span>
          <input 
            type="date"
            className="filter-chip-trigger filter-chip-trigger--select h-9 px-3"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </label>

        <label className="filter-chip-field">
          <span className="filter-field-label">End Date</span>
          <input 
            type="date"
            className="filter-chip-trigger filter-chip-trigger--select h-9 px-3"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </label>

        <button 
          onClick={handleGo}
          disabled={isLoading}
          className={`ml-2 px-8 py-2 font-bold rounded-full shadow transition-all ${
            isLoading 
              ? 'bg-gray-400 cursor-not-allowed opacity-70 text-white' 
              : 'bg-green-600 hover:bg-green-700 text-white hover:shadow-md'
          }`}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading...
            </span>
          ) : 'Go'}
        </button>
      </div>
      <p className="filter-bar-meta">
        <strong>Scraper Test Mode:</strong> Use this panel to test the Python scraper across all supported routes. Click Go to fetch the latest scraped data for your selected dates from the database.
      </p>
    </section>
  )
}
