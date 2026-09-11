import React, { useMemo, useState } from 'react'
import { Bus, HelpCircle, IndianRupee, MapPinned, Medal, Sparkles, Star, Users } from 'lucide-react'
import type { RedbusSrpEntry } from '../api'
import {
  QUALITY_DIMENSIONS,
  computeSrpFilterKpis,
  formatInrKpi,
  formatNum1,
  formatNum2,
  formatPct0,
  type SrpFilterKpis,
} from '../lib/srpFilterKpis'

interface Props {
  filteredRows: RedbusSrpEntry[]
}

function Tip({ text }: { text: string }) {
  return (
    <span className="srp-fkpi__tip" title={text} aria-label={text}>
      <HelpCircle size={12} strokeWidth={2.4} />
    </span>
  )
}

function Card({
  label,
  value,
  secondary,
  sample,
  tip,
  icon,
  accent,
  children,
}: {
  label: string
  value?: string
  secondary?: React.ReactNode
  sample?: string | null
  tip: string
  icon: React.ReactNode
  accent: string
  children?: React.ReactNode
}) {
  return (
    <article className="srp-fkpi" style={{ ['--fkpi-accent' as string]: accent }}>
      <div className="srp-fkpi__top">
        <div className="srp-fkpi__label-row">
          <p className="srp-fkpi__label">{label}</p>
          <Tip text={tip} />
        </div>
        <span className="srp-fkpi__icon" aria-hidden>
          {icon}
        </span>
      </div>
      {value != null ? <p className="srp-fkpi__value">{value}</p> : null}
      {secondary ? <div className="srp-fkpi__secondary">{secondary}</div> : null}
      {children}
      {sample ? <p className="srp-fkpi__sample">{sample}</p> : null}
    </article>
  )
}

function QualityPopover({ kpis }: { kpis: SrpFilterKpis }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="srp-fkpi__quality">
      <button
        type="button"
        className="srp-fkpi__quality-btn"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        Dimension breakdown
      </button>
      {open ? (
        <div className="srp-fkpi__quality-panel" role="dialog" aria-label="Service quality dimensions">
          <ul>
            {QUALITY_DIMENSIONS.map(dim => {
              const hit = kpis.qualityDims[dim.id]
              return (
                <li key={dim.id}>
                  <span>{dim.label}</span>
                  <strong className="tabular-nums">
                    {hit.avg == null ? '—' : `${formatNum1(hit.avg)}`}
                    {hit.n > 0 ? <em> · n={hit.n}</em> : null}
                  </strong>
                </li>
              )
            })}
          </ul>
          <p>Customer mention rate (%) — nulls excluded.</p>
        </div>
      ) : null}
    </div>
  )
}

export default function SrpFilterKpiStrip({ filteredRows }: Props) {
  const kpis = useMemo(() => computeSrpFilterKpis(filteredRows), [filteredRows])

  const sample = (n: number, noun = 'services') =>
    n > 0 ? `Based on ${n.toLocaleString('en-IN')} ${noun}` : null

  const fare = kpis.fareByBusType

  return (
    <section className="srp-fkpi-strip" aria-label="Filter KPI snapshot">
      <div className="srp-fkpi-strip__head">
        <div>
          <h3 className="srp-fkpi-strip__title">Market snapshot</h3>
          <p className="srp-fkpi-strip__sub">
            Live from the filtered service listings · nulls excluded · recalculates with every filter
          </p>
        </div>
      </div>

      <div className="srp-fkpi-grid">
        <Card
          label="Services"
          value={kpis.serviceCount ? kpis.serviceCount.toLocaleString('en-IN') : '—'}
          tip="Count of services in the current filter set (operator, route, bus type, rating, travel dates)."
          icon={<Bus size={15} strokeWidth={2.4} />}
          accent="#0c4dc3"
        />
        <Card
          label="Operators"
          value={kpis.operatorCount ? kpis.operatorCount.toLocaleString('en-IN') : '—'}
          tip="Distinct operators among filtered services."
          icon={<Users size={15} strokeWidth={2.4} />}
          accent="#1d4ed8"
        />
        <Card
          label="Routes"
          value={kpis.routeCount ? kpis.routeCount.toLocaleString('en-IN') : '—'}
          tip="Distinct routes among filtered services."
          icon={<MapPinned size={15} strokeWidth={2.4} />}
          accent="#0369a1"
        />
        <Card
          label="Avg. Fares"
          tip="Mean ticket price by bus type (Seater, Sleeper, Semi-Sleeper). Others excluded. Null fares excluded."
          icon={<IndianRupee size={15} strokeWidth={2.4} />}
          accent="#0a3fa0"
          sample={sample(kpis.fareTypeN, 'priced services')}
        >
          <ul className="srp-fkpi__stack">
            <li>
              <span>Seater</span>
              <strong className="tabular-nums">{formatInrKpi(fare.seater.avg)}</strong>
            </li>
            <li>
              <span>Sleeper</span>
              <strong className="tabular-nums">{formatInrKpi(fare.sleeper.avg)}</strong>
            </li>
            <li>
              <span>Semi-Sleeper</span>
              <strong className="tabular-nums">{formatInrKpi(fare.semi.avg)}</strong>
            </li>
          </ul>
        </Card>

        <Card
          label="Avg. Rating"
          value={formatNum2(kpis.avgRating)}
          secondary={
            <>
              <span>≥ 4.5 share</span>
              <span className="tabular-nums">{formatPct0(kpis.pctRatingGe45)}</span>
            </>
          }
          sample={sample(kpis.ratingN, 'rated services')}
          tip="Mean of non-null ratings only. Secondary: % of those with rating ≥ 4.5."
          icon={<Star size={15} strokeWidth={2.4} />}
          accent="#ca8a04"
        />
        <Card
          label="Avg. SRP Rank"
          value={kpis.avgSrp == null ? '—' : `#${formatNum1(kpis.avgSrp)}`}
          secondary={
            <div className="srp-fkpi__secondary-stack">
              <div>
                <span>Top 5% avg</span>
                <span className="tabular-nums">
                  {kpis.top5PctAvgSrp == null ? '—' : `#${formatNum1(kpis.top5PctAvgSrp)}`}
                </span>
              </div>
              <div>
                <span>Top 10% avg</span>
                <span className="tabular-nums">
                  {kpis.top10PctAvgSrp == null ? '—' : `#${formatNum1(kpis.top10PctAvgSrp)}`}
                </span>
              </div>
            </div>
          }
          sample={sample(kpis.srpN, 'ranked services')}
          tip="Mean SRP rank from non-null ranks (lower is better). Top 5%/10% avg = mean rank among the best (lowest-rank) 5%/10% of ranked services."
          icon={<Medal size={15} strokeWidth={2.4} />}
          accent="#7c3aed"
        />
        <Card
          label="Service Quality"
          value={kpis.serviceQuality == null ? '—' : `${formatNum1(kpis.serviceQuality)}/100`}
          secondary={<span>Composite of 8 experience KPIs</span>}
          sample={sample(kpis.serviceQualityN)}
          tip="Per service: average of non-null mention rates among Punctuality, Cleanliness, Staff Behaviour, Driving, AC, Seat Comfort, Live Tracking, Rest Stop Hygiene. Then average across services."
          icon={<Sparkles size={15} strokeWidth={2.4} />}
          accent="#0f766e"
        >
          {kpis.serviceQualityN > 0 ? <QualityPopover kpis={kpis} /> : null}
        </Card>
      </div>
    </section>
  )
}
