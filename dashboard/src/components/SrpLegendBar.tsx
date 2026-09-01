import React from 'react'
import { Clock, Info } from 'lucide-react'

const LEGEND = [
  { tier: 'elite', label: 'Top 10', sample: '#8' },
  { tier: 'strong', label: '11–30', sample: '#22' },
  { tier: 'mid', label: '31–100', sample: '#64' },
  { tier: 'weak', label: '100+', sample: '#142' },
] as const

export default function SrpLegendBar() {
  return (
    <div className="srp-legend-bar">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="text-[0.65rem] font-black uppercase tracking-wider text-theme-muted">Rank bands</span>
        {LEGEND.map(item => (
          <span key={item.tier} className="inline-flex items-center gap-1.5">
            <span className={`srp-rank-badge srp-rank-badge--${item.tier} srp-rank-badge--compact`}>{item.sample}</span>
            <span className="text-xs font-semibold text-theme-secondary">{item.label}</span>
          </span>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <p className="flex items-start gap-1.5 text-[0.7rem] font-medium leading-relaxed text-theme-muted">
          <Info size={13} className="mt-0.5 shrink-0 opacity-70" />
          <span>
            <strong className="font-bold text-theme-secondary">Rows:</strong> chevron on Route / Operator to collapse.
            Default shows operator rollups — expand to see each service.
          </span>
        </p>
        <p className="flex items-start gap-1.5 text-[0.7rem] font-medium leading-relaxed text-theme-muted">
          <Clock size={13} className="mt-0.5 shrink-0 opacity-70" />
          <span>
            <strong className="font-bold text-theme-secondary">Columns:</strong> MTD Avg → expand to W1–W4 → expand to daily Avg → expand to 5am·11am·5pm·11pm.
          </span>
        </p>
      </div>
    </div>
  )
}
