import React from 'react'
import { Star } from 'lucide-react'
import KPICard from './KPICard'
import {
  TRACKED_PEER_OPERATORS,
  findRouteOperatorForPeer,
  type TrackedPeerId,
} from '../lib/marketplaceConfig'
import type { OperatorKpiRow } from '../lib/marketplaceMockData'
import { formatMetric } from '../lib/insights'

interface Props {
  routeOperators: string[]
  kpiRows: OperatorKpiRow[]
}

export default function TrackedPeerCards({ routeOperators, kpiRows }: Props) {
  const rowByName = new Map(kpiRows.map(r => [r.name, r]))

  return (
    <section className="liquid-glass chart-panel panel-shell overflow-hidden">
      <header className="panel-header panel-header--divider">
        <div className="panel-header-copy">
          <p className="panel-kicker">Peer focus</p>
          <h2 className="section-title">Tracked competitors</h2>
          <p className="chart-subtitle">
            FreshBus plus five key peers — always visible. Values reflect the selected route (sample data).
          </p>
        </div>
      </header>
      <div className="visual-body grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {TRACKED_PEER_OPERATORS.map(peer => {
          const routeName = findRouteOperatorForPeer(routeOperators, peer.id as TrackedPeerId)
          const row = routeName ? rowByName.get(routeName) : undefined

          return (
            <KPICard
              key={peer.id}
              label={peer.label}
              value={row ? `#${row.competitiveRank}` : routeName ? '—' : 'N/A'}
              caption={
                row
                  ? `${formatMetric(row.overallRating, 2)}★ · ${row.reviewCount.toLocaleString()} reviews`
                  : routeName
                    ? 'No KPI row'
                    : 'Not on this route'
              }
              icon={peer.id === 'freshbus' ? <Star size={20} /> : undefined}
              accent={peer.accent}
              className={peer.id === 'freshbus' ? 'ring-2 ring-amber-400/40' : undefined}
            />
          )
        })}
      </div>
      <p className="visual-body border-t border-[var(--border-subtle)] pt-3 text-xs font-semibold text-theme-muted">
        Zingbus and Zingbus Plus are treated as the same operator. Cards show route rank; use the operator filter to shape tables and charts below.
      </p>
    </section>
  )
}
