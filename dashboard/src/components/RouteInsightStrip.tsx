import React from 'react'
import { ArrowDown, ArrowUp, Crown, Minus } from 'lucide-react'
import { displayOperatorName, isFreshBus, isTrackedPeer } from '../lib/marketplaceConfig'
import type { OperatorKpiRow } from '../lib/marketplaceMockData'
import { formatMetric } from '../lib/insights'
import { cx } from '../lib/insights'

interface Props {
  routeLabel: string
  rows: OperatorKpiRow[]
  accent: string
}

export default function RouteInsightStrip({ routeLabel, rows, accent }: Props) {
  const freshbus = rows.find(r => isFreshBus(r.name))
  const leader = rows[0]
  const peerRows = rows.filter(r => isTrackedPeer(r.name) && !isFreshBus(r.name))

  if (!freshbus) {
    return (
      <div className="liquid-glass rounded-xl px-4 py-3 text-sm font-semibold text-theme-muted">
        FreshBus is not listed on {routeLabel}. Peer cards and network stats still apply elsewhere.
      </div>
    )
  }

  const leaderGap =
    leader && !isFreshBus(leader.name)
      ? Math.round((leader.overallRating - freshbus.overallRating) * 100) / 100
      : 0

  const peerRatings = peerRows.map(r => r.overallRating)
  const peerMedian =
    peerRatings.length
      ? peerRatings.sort((a, b) => a - b)[Math.floor(peerRatings.length / 2)]
      : null
  const vsPeers =
    peerMedian != null ? Math.round((freshbus.overallRating - peerMedian) * 100) / 100 : null

  const tagEntries = Object.entries(freshbus.tags).sort((a, b) => b[1] - a[1])
  const strongest = tagEntries[0]
  const weakest = tagEntries[tagEntries.length - 1]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <InsightTile
        label="FreshBus rank on route"
        value={`#${freshbus.competitiveRank}`}
        detail={`of ${rows.length} operators on ${routeLabel}`}
        accent={accent}
      />
      <InsightTile
        label="Gap to route leader"
        value={leader && isFreshBus(leader.name) ? 'Leading' : leaderGap ? `−${formatMetric(leaderGap, 2)}★` : '—'}
        detail={
          leader && !isFreshBus(leader.name)
            ? `${displayOperatorName(leader.name)} leads at ${formatMetric(leader.overallRating, 2)}★`
            : 'FreshBus holds #1 on this corridor'
        }
        icon={leader && isFreshBus(leader.name) ? <Crown size={16} /> : leaderGap > 0 ? <ArrowDown size={16} /> : undefined}
      />
      <InsightTile
        label="vs tracked peer median"
        value={vsPeers == null ? '—' : vsPeers >= 0 ? `+${formatMetric(vsPeers, 2)}★` : formatMetric(vsPeers, 2) + '★'}
        detail={peerRows.length ? `Median of ${peerRows.length} peers on route` : 'No tracked peers on route'}
        icon={vsPeers == null ? undefined : vsPeers >= 0 ? <ArrowUp size={16} className="text-emerald-600" /> : <ArrowDown size={16} className="text-rose-500" />}
      />
      <InsightTile
        label="Dimension spread"
        value={strongest && weakest ? formatMetric(strongest[1] - weakest[1], 2) : '—'}
        detail={
          strongest && weakest
            ? `Strong: ${labelTag(strongest[0])} · Weak: ${labelTag(weakest[0])}`
            : 'Tag breakdown in heatmap'
        }
        icon={<Minus size={16} />}
      />
    </div>
  )
}

function labelTag(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function InsightTile({
  label,
  value,
  detail,
  accent,
  icon,
}: {
  label: string
  value: string
  detail: string
  accent?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="liquid-glass rounded-xl border border-[var(--border-subtle)] p-4">
      <p className="text-[0.65rem] font-black uppercase tracking-wider text-theme-muted">{label}</p>
      <p className={cx('mt-1 flex items-center gap-2 text-2xl font-extrabold tabular-nums')} style={accent ? { color: accent } : undefined}>
        {icon}
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold text-theme-secondary">{detail}</p>
    </div>
  )
}
