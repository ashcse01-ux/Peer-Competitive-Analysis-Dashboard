import React from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { Activity, Award, Gauge, Layers3, ShieldCheck, Target, Trophy } from 'lucide-react'
import { useOverview, type OverviewOperator } from '../api'
import ChartTooltip from '../components/ChartTooltip'
import KPICard from '../components/KPICard'
import MetricTip from '../components/MetricTip'
import SectionHeader from '../components/SectionHeader'
import { useTranslation } from '../i18n/useTranslation'
import { tip } from '../lib/metricGlossary'
import {
  formatReviewCount,
  formatStarRating,
  operatorColor,
  average,
  cx,
  formatMetric,
  getInitials,
  latestTimestamp,
  scoreBand,
  sentimentToFive,
  sum,
} from '../lib/insights'

const METRICS = [
  { key: 'gp_rating', label: 'Google Play Store' },
  { key: 'ios_rating', label: 'Apple App Store' },
  { key: 'google_rating', label: 'Google Search' },
  { key: 'redbus_sentiment', label: 'Redbus Routes' },
] as const

type MetricKey = typeof METRICS[number]['key']

function comparableValue(op: OverviewOperator, key: MetricKey) {
  const value = op[key]
  return key === 'redbus_sentiment' ? sentimentToFive(value) : value
}

function operatorMomentum(op: OverviewOperator) {
  return average([op.gp_delta, op.ios_delta, op.google_delta])
}

function opportunityIndex(op: OverviewOperator) {
  const compositeGap = Math.max(0, 5 - (op.composite_score ?? 0))
  const routeGap = Math.max(0, 5 - (sentimentToFive(op.redbus_sentiment) ?? 0))
  const volatility = sum([Math.abs(op.gp_delta ?? 0), Math.abs(op.ios_delta ?? 0), Math.abs(op.google_delta ?? 0)])
  return Number((compositeGap * 0.48 + routeGap * 0.34 + volatility * 0.18).toFixed(2))
}

function MetricBar({ label, value, color }: { label: string; value: number | null | undefined; color: string }) {
  const width = value == null ? 0 : Math.max(4, Math.min(100, (value / 5) * 100))
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
        <span className="truncate">{label}</span>
        <span className="text-[#14211f]">{formatMetric(value, 1)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-900/5">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export default function OverviewPage() {
  const { data, isLoading, isError } = useOverview()
  const { t } = useTranslation()

  if (isLoading) return <div className="glass-panel p-6 text-sm font-semibold text-slate-500">Loading overview...</div>
  if (isError) return <div className="glass-panel p-6 text-sm font-semibold text-rose-600">Overview data could not be loaded.</div>

  const operators = data?.operators ?? []
  const leader = operators[0]
  const freshbus = operators.find(op => op.slug === 'freshbus')
  const avgComposite = average(operators.map(op => op.composite_score))
  const avgMomentum = average(operators.map(operatorMomentum))
  const coverageTotal = operators.length * METRICS.length
  const coverageFilled = operators.reduce(
    (count, op) => count + METRICS.filter(metric => comparableValue(op, metric.key) != null).length,
    0,
  )
  const coveragePct = coverageTotal ? Math.round((coverageFilled / coverageTotal) * 100) : 0
  const freshbusGap = leader && freshbus?.composite_score != null && leader.composite_score != null
    ? leader.composite_score - freshbus.composite_score
    : null
  const routeAvg = average(operators.map(op => op.redbus_sentiment))
  const lastUpdated = latestTimestamp(operators.map(op => op.last_updated))

  const barData = METRICS.map(metric => {
    const entry: Record<string, string | number | null> = { metric: metric.label }
    operators.forEach(op => {
      entry[op.slug] = comparableValue(op, metric.key)
    })
    return entry
  })

  const radarData = METRICS.map(metric => {
    const entry: Record<string, string | number> = { metric: metric.label.replace(' Sentiment', '') }
    operators.forEach(op => {
      entry[op.slug] = comparableValue(op, metric.key) ?? 0
    })
    return entry
  })

  const relationData = operators.map((op, index) => ({
    name: op.name,
    composite: op.composite_score ?? 0,
    route: sentimentToFive(op.redbus_sentiment) ?? 0,
    momentum: operatorMomentum(op) ?? 0,
    z: 120 + opportunityIndex(op) * 52,
    color: operatorColor(op.slug),
  }))

  return (
    <div className="space-y-7">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <div className="hero-glow space-y-5 py-2">
          <div>
            <p className="eyebrow">{t('overview.eyebrow')}</p>
            <h1 className="page-title mt-2 max-w-4xl text-xl font-bold tracking-tight sm:text-2xl">
              <span className="neon-text">{t('overview.title')}</span>
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="control-chip control-chip-active inline-flex items-center gap-2 px-4 text-sm font-black">
              <Trophy size={16} />
              {leader ? `${leader.name} ${t('overview.leader')}` : 'No leader'}
            </span>
            <span className="control-chip inline-flex items-center gap-2 px-4 text-sm font-bold">
              <Activity size={16} />
              {lastUpdated ?? 'Refresh pending'}
            </span>
            <span className="control-chip inline-flex items-center gap-2 px-4 text-sm font-bold">
              <Layers3 size={16} />
              {coveragePct}% {t('common.coverage')}
            </span>
            <Link to="/redbus" className="control-chip inline-flex items-center gap-2 px-4 text-sm font-bold">
              <Layers3 size={16} />
              {t('nav.redbus')}
            </Link>
          </div>
        </div>

        <div className="glass-panel-strong p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <MetricTip tip={tip('compositeScore')} as="p" className="eyebrow">Leader card</MetricTip>
              <h2 className="mt-2 text-2xl font-black text-[#14211f]">{leader?.name ?? 'No data'}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {leader ? <><MetricTip tip={tip('scoreBand')}>{scoreBand(leader.composite_score)}</MetricTip> composite position</> : 'Waiting for metrics'}
              </p>
            </div>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#14211f] text-lg font-black text-white shadow-lg shadow-slate-900/10">
              {leader ? getInitials(leader.name) : '--'}
            </span>
          </div>
          <div className="mt-5 grid gap-3">
            {METRICS.map((metric) => (
              <MetricBar
                key={metric.key}
                label={metric.label}
                value={leader ? comparableValue(leader, metric.key) : null}
                color={operatorColor(leader?.slug ?? 'freshbus')}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label="Overall Rating"
          value={formatMetric(avgComposite, 2)}
          tip={tip('overallRating')}
          caption="Average across all sources"
          icon={<Gauge size={20} />}
          accent="#2563EB"
        />
        <KPICard
          label="FreshBus Gap"
          value={freshbusGap != null ? formatMetric(freshbusGap, 2) : null}
          tip={tip('freshbusGap')}
          caption={freshbusGap != null && freshbusGap <= 0.05 ? 'At parity' : 'Behind the leader'}
          icon={<Target size={20} />}
          accent="#F97316"
        />
        <KPICard
          label="Rating Change"
          value={formatMetric(avgMomentum, 2)}
          delta={avgMomentum}
          tip={tip('momentum')}
          caption="Change this month"
          icon={<Activity size={20} />}
          accent="#16A34A"
        />
        <KPICard
          label="Redbus Route Mood"
          value={formatMetric(routeAvg, 2)}
          tip={tip('routeMood')}
          caption="Average route review mood"
          icon={<ShieldCheck size={20} />}
          accent="#0D9488"
        />
      </section>

      <section className="glass-panel p-5">
        <SectionHeader
          eyebrow={t('overview.dataSources')}
          title={t('overview.dataSourcesTitle')}
          subtitle="Refreshed on the 28th each month — click ↻ anytime for manual update."
          eyebrowTip={tip('lastRefresh')}
          titleTip="Four platforms tracked for competitive intelligence"
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Google Play Store',
              rating: average(operators.map(o => o.gp_rating)),
              count: sum(operators.map(o => o.gp_review_count)),
              to: '/google-play',
              tipKey: 'googlePlay',
            },
            {
              label: 'Apple App Store',
              rating: average(operators.map(o => o.ios_rating)),
              count: sum(operators.map(o => o.ios_review_count)),
              to: '/apple-store',
              tipKey: 'appleStore',
            },
            {
              label: 'Google Search Reviews',
              rating: average(operators.map(o => o.google_rating)),
              count: sum(operators.map(o => o.google_review_count)),
              to: '/google-reviews',
              tipKey: 'googleSearch',
            },
            {
              label: 'Redbus Analysis',
              rating: sentimentToFive(routeAvg),
              count: sum(operators.map(o => o.redbus_review_count)),
              to: '/redbus',
              tipKey: 'redbus',
            },
          ].map(pillar => (
            <Link
              key={pillar.label}
              to={pillar.to}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 transition hover:border-[var(--border-glow)] hover:shadow-[var(--glow-blue)]"
            >
              <MetricTip tip={tip(pillar.tipKey)} className="text-sm font-bold text-theme-primary">{pillar.label}</MetricTip>
              <p className="mt-2 text-2xl font-bold text-theme-primary">{formatStarRating(pillar.rating)}</p>
              <p className="mt-1 text-xs font-semibold text-theme-muted">{formatReviewCount(pillar.count)}</p>
              <p className="mt-2 text-[0.68rem] text-theme-muted">Updated {lastUpdated ?? '—'}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <MetricTip tip={tip('composite')} as="p" className="eyebrow">Metric comparison</MetricTip>
              <MetricTip tip="Side-by-side scores for every operator" as="p" className="section-title">Cross-source score stack</MetricTip>
            </div>
            <span className="rounded-full bg-slate-900/5 px-3 py-1 text-xs font-black text-slate-500">
              5-point scale
            </span>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={barData} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
              <CartesianGrid className="chart-grid" vertical={false} />
              <XAxis dataKey="metric" tick={{ fill: '#64706d', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 5]} tick={{ fill: '#64706d', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,119,182,0.05)' }} />
              <Legend wrapperStyle={{ color: '#50615d', fontSize: 12, fontWeight: 700 }} />
              {operators.map((op, index) => (
                <Bar key={op.slug} dataKey={op.slug} name={op.name} fill={operatorColor(op.slug)} radius={[5, 5, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4">
            <MetricTip tip={tip('radar')} as="p" className="eyebrow">Shape analysis</MetricTip>
            <MetricTip tip={tip('radar')} as="p" className="section-title">Competitive radar</MetricTip>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <RadarChart data={radarData} outerRadius="74%">
              <PolarGrid stroke="rgba(20,33,31,0.12)" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#64706d', fontSize: 11, fontWeight: 700 }} />
              <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: '#8a9995', fontSize: 10 }} axisLine={false} />
              {operators.map((op, index) => (
                <Radar
                  key={op.slug}
                  name={op.name}
                  dataKey={op.slug}
                  stroke={operatorColor(op.slug)}
                  fill={operatorColor(op.slug)}
                  fillOpacity={0.08}
                  strokeWidth={2}
                />
              ))}
              <Legend wrapperStyle={{ color: '#50615d', fontSize: 11, fontWeight: 700 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <MetricTip tip={tip('scatter')} as="p" className="eyebrow">Relationship map</MetricTip>
              <MetricTip tip={tip('scatter')} as="p" className="section-title">Composite vs route sentiment</MetricTip>
            </div>
            <Award size={20} className="text-[#0077b6]" />
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: -8 }}>
              <CartesianGrid className="chart-grid" />
              <XAxis
                type="number"
                dataKey="composite"
                name="Composite"
                domain={[0, 5]}
                tick={{ fill: '#64706d', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="number"
                dataKey="route"
                name="Route Sentiment"
                domain={[0, 5]}
                tick={{ fill: '#64706d', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <ZAxis type="number" dataKey="z" range={[90, 280]} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }} />
              <Scatter name="Operators" data={relationData}>
                {relationData.map(item => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel p-4 sm:p-5">
          <div className="mb-4">
            <MetricTip tip={tip('momentum')} as="p" className="eyebrow">Operator pulse</MetricTip>
            <MetricTip tip={tip('opportunity')} as="p" className="section-title">Rank, momentum, and opportunity</MetricTip>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {operators.map((op) => {
              const color = operatorColor(op.slug)
              const momentum = operatorMomentum(op)
              return (
                <article key={op.slug} className="rounded-lg border border-slate-900/10 bg-white/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[#14211f]">{op.name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Rank {op.rank} - {scoreBand(op.composite_score)}
                      </p>
                    </div>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ backgroundColor: color }}>
                      {getInitials(op.name)}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-black text-[#14211f]">{formatMetric(op.composite_score, 2)}</p>
                      <MetricTip tip={tip('compositeScore')} className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-400">Score</MetricTip>
                    </div>
                    <div>
                      <p className={cx('text-lg font-black', (momentum ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                        {formatMetric(momentum, 2)}
                      </p>
                      <MetricTip tip={tip('momentum')} className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-400">Move</MetricTip>
                    </div>
                    <div>
                      <p className="text-lg font-black text-[#14211f]">{opportunityIndex(op)}</p>
                      <MetricTip tip={tip('opportunityIndex')} className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-400">Opp.</MetricTip>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-900/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <MetricTip tip={tip('rank')} as="p" className="eyebrow">Leaderboard</MetricTip>
            <MetricTip tip={tip('composite')} as="p" className="section-title">Competitive score table</MetricTip>
          </div>
          <MetricTip tip={tip('opportunityIndex')} className="text-xs font-bold text-slate-500">Opportunity blends rating gap, route gap, and volatility</MetricTip>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th><MetricTip tip={tip('rank')}>Rank</MetricTip></th>
                <th>Operator</th>
                <th><MetricTip tip={tip('compositeScore')}>Composite</MetricTip></th>
                <th><MetricTip tip={tip('googlePlay')}>App Stores</MetricTip></th>
                <th><MetricTip tip={tip('googleSearch')}>Google</MetricTip></th>
                <th><MetricTip tip={tip('redbus')}>Redbus</MetricTip></th>
                <th><MetricTip tip={tip('momentum')}>Momentum</MetricTip></th>
                <th><MetricTip tip={tip('opportunity')}>Opportunity</MetricTip></th>
              </tr>
            </thead>
            <tbody>
              {operators.map((op, index) => {
                const color = operatorColor(op.slug)
                return (
                  <tr key={op.slug}>
                    <td className="font-black text-[#0077b6]">#{op.rank}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-black text-white" style={{ backgroundColor: color }}>
                          {getInitials(op.name)}
                        </span>
                        <span className="font-black text-[#14211f]">{op.name}</span>
                      </div>
                    </td>
                    <td className="font-black text-[#14211f]">{formatMetric(op.composite_score, 2)}</td>
                    <td>{formatMetric(average([op.gp_rating, op.ios_rating]), 1)}</td>
                    <td>{formatMetric(op.google_rating, 1)}</td>
                    <td>{formatMetric(op.redbus_sentiment, 2)}</td>
                    <td className={cx('font-black', (operatorMomentum(op) ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                      {formatMetric(operatorMomentum(op), 2)}
                    </td>
                    <td className="font-black text-[#14211f]">{opportunityIndex(op)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
