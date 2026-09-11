import React, { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { RedbusSrpEntry } from '../api'
import OperatorViewToggle, {
  resolveOperatorLimit,
  type OperatorViewLimit,
} from './OperatorViewToggle'
import { FB_BLUE } from '../lib/playTopics'
import { cx } from '../lib/insights'
import {
  EXPERIENCE_KPIS,
  findKpi,
  mentionRate,
  operatorColorMap,
  poolByOperator,
  poolByRoute,
  type ExperienceKpiId,
} from '../lib/experienceKpiAnalytics'

interface Props {
  rows: RedbusSrpEntry[]
  startDate: string
  endDate: string
}

function ChartCard({
  title,
  description,
  className,
  children,
  empty,
  action,
}: {
  title: string
  description: string
  className?: string
  children: React.ReactNode
  empty?: string | null
  action?: React.ReactNode
}) {
  return (
    <section className={cx('srp-viz-card', className)}>
      <header className="srp-viz-card__head">
        <div className="srp-viz-card__head-main">
          <h3 className="srp-viz-card__title">{title}</h3>
          <p className="srp-viz-card__desc">{description}</p>
        </div>
        {action ? <div className="srp-viz-card__action">{action}</div> : null}
      </header>
      <div className="srp-viz-card__body">{empty ? <div className="srp-viz-empty">{empty}</div> : children}</div>
    </section>
  )
}

function KpiPills({
  value,
  onChange,
}: {
  value: ExperienceKpiId
  onChange: (id: ExperienceKpiId) => void
}) {
  return (
    <div className="exp-kpi-pills" role="tablist" aria-label="Experience KPI">
      {EXPERIENCE_KPIS.map(k => (
        <button
          key={k.id}
          type="button"
          role="tab"
          aria-selected={value === k.id}
          className={cx('exp-kpi-pill', value === k.id && 'exp-kpi-pill--on')}
          style={value === k.id ? { borderColor: k.color, color: k.color } : undefined}
          onClick={() => onChange(k.id)}
        >
          {k.label}
        </button>
      ))}
    </div>
  )
}

export default function ExperienceKpiPanel({ rows }: Props) {
  const [opLimit, setOpLimit] = useState<OperatorViewLimit>(10)
  const [routeLimit, setRouteLimit] = useState<OperatorViewLimit>(10)
  const [kpiByOp, setKpiByOp] = useState<ExperienceKpiId>('punctuality')
  const [kpiByRoute, setKpiByRoute] = useState<ExperienceKpiId>('punctuality')

  const operators = useMemo(() => poolByOperator(rows), [rows])
  const routes = useMemo(() => poolByRoute(rows), [rows])
  const colors = useMemo(() => operatorColorMap(operators), [operators])

  const takeOps = <T,>(list: T[], limit: OperatorViewLimit) =>
    list.slice(0, resolveOperatorLimit(limit, list.length))

  const opChart = takeOps(operators, opLimit)
    .map(op => ({
      name: op.operatorDisplay,
      operator: op.operator,
      rate: mentionRate(op.pools[kpiByOp]),
      n: op.pools[kpiByOp].ratings,
      services: op.serviceCount,
      fill: colors.get(op.operator) || FB_BLUE,
    }))
    .filter(r => r.rate != null)

  const routeChart = takeOps(routes, routeLimit)
    .map(r => ({
      name: r.route,
      rate: mentionRate(r.pools[kpiByRoute]),
      n: r.pools[kpiByRoute].ratings,
      services: r.serviceCount,
    }))
    .filter(r => r.rate != null)

  const barH = (n: number) => Math.min(720, Math.max(280, n * 32 + 24))

  if (!rows.length) return null

  return (
    <section className="srp-listings-panel exp-kpi-panel">
      <div className="srp-listings-panel__head">
        <div>
          <h3 className="srp-listings-panel__title">Experience KPI analytics</h3>
          <p className="srp-listings-panel__sub">
            Customer Mention Rate (%) = eligible mentions ÷ eligible ratings × 100. Not a quality
            score. Buses need 100+ ratings; mentions cannot exceed ratings; missing tags are omitted
            (not 0%).
          </p>
        </div>
        <span className="srp-listings-count">
          <strong>{EXPERIENCE_KPIS.length}</strong> Experience KPIs
        </span>
      </div>

      <div className="srp-viz exp-kpi-viz">
        <div className="srp-viz-grid">
          <ChartCard
            className="srp-viz-span-6"
            title="Experience KPI by operator"
            description={`${findKpi(kpiByOp).label} Customer Mention Rate (%) by operator.`}
            empty={!opChart.length ? 'No eligible operator mention rates for this KPI.' : null}
            action={
              <div className="exp-kpi-actions">
                <KpiPills value={kpiByOp} onChange={setKpiByOp} />
                <OperatorViewToggle value={opLimit} total={operators.length} onChange={setOpLimit} />
              </div>
            }
          >
            <div className="srp-viz-chart srp-viz-chart--ops" style={{ height: barH(opChart.length) }}>
              <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
                <BarChart data={opChart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={128} tick={{ fontSize: 11 }} interval={0} />
                  <Tooltip
                    formatter={(v: number, _n, item) => {
                      const row = item?.payload
                      return [
                        `${Number(v).toFixed(1)}%`,
                        `${row?.services ?? 0} services · ${row?.n ?? 0} eligible ratings`,
                      ]
                    }}
                  />
                  <Bar dataKey="rate" name="Customer Mention Rate" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                    {opChart.map(r => (
                      <Cell key={r.operator} fill={r.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            className="srp-viz-span-6"
            title="Experience KPI by route"
            description={`${findKpi(kpiByRoute).label} Customer Mention Rate (%) by route.`}
            empty={!routeChart.length ? 'No eligible route mention rates for this KPI.' : null}
            action={
              <div className="exp-kpi-actions">
                <KpiPills value={kpiByRoute} onChange={setKpiByRoute} />
                <OperatorViewToggle value={routeLimit} total={routes.length} onChange={setRouteLimit} />
              </div>
            }
          >
            <div className="srp-viz-chart srp-viz-chart--ops" style={{ height: barH(routeChart.length) }}>
              <ResponsiveContainer width="100%" height="100%" debounce={80} minWidth={0}>
                <BarChart data={routeChart} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} interval={0} />
                  <Tooltip
                    formatter={(v: number, _n, item) => {
                      const row = item?.payload
                      return [
                        `${Number(v).toFixed(1)}%`,
                        `${row?.services ?? 0} services · ${row?.n ?? 0} eligible ratings`,
                      ]
                    }}
                  />
                  <Bar
                    dataKey="rate"
                    name="Customer Mention Rate"
                    fill={findKpi(kpiByRoute).color}
                    radius={[0, 6, 6, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </div>

      <p className="exp-kpi-footnote">
        Gold bars = FreshBus. Top 10 / Top 25 / View All ranks operators and routes by service count.
      </p>
    </section>
  )
}
