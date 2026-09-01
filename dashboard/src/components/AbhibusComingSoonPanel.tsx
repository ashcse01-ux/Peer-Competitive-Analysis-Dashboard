import React from 'react'
import {
  ArrowRight,
  Bus,
  Clock,
  MapPin,
  Radar,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import KPICard from './KPICard'
import SectionHeader from './SectionHeader'
import { cx, formatCompact } from '../lib/insights'
import { REDBUS_ROUTE_PAIRS, routeDisplayLabel } from '../lib/redbusRoutes'

const ABHIBUS_ORANGE = '#E85D04'
const ABHIBUS_ORANGE_SOFT = 'rgba(232, 93, 4, 0.14)'

interface Props {
  channel: 'reviews' | 'srp'
}

const PLANNED_KPIS = [
  { label: 'Corridors tracked', value: '24+', caption: 'Major interstate routes', icon: MapPin },
  { label: 'Review dimensions', value: '9', caption: 'Structured tag taxonomy', icon: Target },
  { label: 'Peer operators', value: '6+', caption: 'Including FreshBus', icon: Bus },
  { label: 'Refresh cadence', value: 'Daily', caption: 'Automated snapshots', icon: Clock },
] as const

const ROADMAP = [
  {
    step: '01',
    title: 'Scraper integration',
    detail: 'Abhibus route pages and search results wired into the data pipeline.',
    status: 'In progress',
  },
  {
    step: '02',
    title: 'Tag classification',
    detail: 'Same 9-dimension review model used on Redbus for apples-to-apples comparison.',
    status: 'Queued',
  },
  {
    step: '03',
    title: 'SRP rank tracking',
    detail: 'Daily position grid by operator, route, and departure timing.',
    status: 'Queued',
  },
] as const

export default function AbhibusComingSoonPanel({ channel }: Props) {
  const isSrp = channel === 'srp'
  const previewRoutes = REDBUS_ROUTE_PAIRS.slice(0, 8)

  return (
    <div className="flex flex-col gap-6">
      <div
        className="relative overflow-hidden rounded-2xl border p-6 sm:p-8"
        style={{
          borderColor: `${ABHIBUS_ORANGE}44`,
          background: `linear-gradient(135deg, ${ABHIBUS_ORANGE_SOFT} 0%, rgba(255,255,255,0.4) 55%, rgba(251,188,4,0.08) 100%)`,
        }}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl"
          style={{ background: `${ABHIBUS_ORANGE}22` }}
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider"
              style={{ background: ABHIBUS_ORANGE_SOFT, color: ABHIBUS_ORANGE }}
            >
              <Sparkles size={14} />
              Coming soon
            </span>
            <h3 className="text-2xl font-extrabold tracking-tight text-theme-primary sm:text-3xl">
              {isSrp ? 'Abhibus SRP tracking is being wired up' : 'Abhibus route analytics is on the way'}
            </h3>
            <p className="text-sm font-semibold leading-relaxed text-theme-secondary sm:text-base">
              {isSrp
                ? 'Search-result position grids for FreshBus and peers on Abhibus — same workflow as Redbus SRP Tracking, with operator, route, and date filters.'
                : 'Route-level review sentiment, 9-dimension tag leaderboards, and corridor heatmaps for the Abhibus marketplace — mirroring Redbus Analytics.'}
            </p>
          </div>
          <div
            className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border shadow-lg"
            style={{
              borderColor: `${ABHIBUS_ORANGE}55`,
              background: 'rgba(255,255,255,0.75)',
              boxShadow: `0 12px 40px ${ABHIBUS_ORANGE}22`,
            }}
          >
            {isSrp ? (
              <Radar size={52} strokeWidth={1.6} style={{ color: ABHIBUS_ORANGE }} />
            ) : (
              <TrendingUp size={52} strokeWidth={1.6} style={{ color: ABHIBUS_ORANGE }} />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLANNED_KPIS.map(kpi => {
          const Icon = kpi.icon
          return (
            <KPICard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              caption={kpi.caption}
              icon={<Icon size={20} />}
              accent={ABHIBUS_ORANGE}
            />
          )
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="liquid-glass chart-panel panel-shell overflow-hidden">
          <SectionHeader
            eyebrow="Preview"
            title={isSrp ? 'SRP grid layout (placeholder)' : 'Corridor coverage (placeholder)'}
            subtitle={
              isSrp
                ? 'Daily rank cells per service timing once data is connected.'
                : 'Same route corridors as Redbus for cross-marketplace comparison.'
            }
          />
          <div className="visual-body overflow-x-auto">
            <table className="data-table min-w-[640px] opacity-60">
              <thead>
                <tr>
                  {isSrp ? (
                    <>
                      <th>Service</th>
                      <th>Timing</th>
                      <th>Rank (sample)</th>
                      <th>Trend</th>
                    </>
                  ) : (
                    <>
                      <th>Route</th>
                      <th>FreshBus rating</th>
                      <th>Market rank</th>
                      <th>Reviews</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {previewRoutes.map((pair, i) => (
                  <tr key={`${pair[0]}-${pair[1]}`}>
                    {isSrp ? (
                      <>
                        <td className="font-bold">FreshBus · {routeDisplayLabel(pair[0], pair[1])}</td>
                        <td>{['06:30', '14:00', '22:15'][i % 3]}</td>
                        <td className="font-extrabold tabular-nums" style={{ color: ABHIBUS_ORANGE }}>
                          #{12 + i * 3}
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                            <Zap size={12} /> Sample
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="font-bold">{routeDisplayLabel(pair[0], pair[1])}</td>
                        <td className="tabular-nums">—</td>
                        <td className="tabular-nums">—</td>
                        <td className="tabular-nums text-theme-muted">{formatCompact(120 + i * 47)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="visual-body border-t border-[var(--border-subtle)] pt-4 text-xs font-semibold text-theme-muted">
            Sample rows for layout preview — live Abhibus data will replace placeholders.
          </p>
        </section>

        <section className="liquid-glass chart-panel panel-shell overflow-hidden">
          <SectionHeader eyebrow="Roadmap" title="Integration plan" subtitle="What ships first for Abhibus Analytics." />
          <div className="visual-body space-y-3">
            {ROADMAP.map(item => (
              <div
                key={item.step}
                className={cx(
                  'rounded-xl border border-[var(--border-subtle)] p-4 transition hover:border-[var(--border-glow)]',
                  item.status === 'In progress' && 'ring-1',
                )}
                style={item.status === 'In progress' ? { ringColor: `${ABHIBUS_ORANGE}55` } : undefined}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-theme-muted">{item.step}</span>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[0.65rem] font-black uppercase tracking-wide"
                    style={{
                      background: item.status === 'In progress' ? ABHIBUS_ORANGE_SOFT : 'rgba(148,163,184,0.15)',
                      color: item.status === 'In progress' ? ABHIBUS_ORANGE : 'var(--text-muted)',
                    }}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="font-extrabold text-theme-primary">{item.title}</p>
                <p className="mt-1 text-sm font-semibold text-theme-secondary">{item.detail}</p>
              </div>
            ))}
          </div>
          <div className="visual-body border-t border-[var(--border-subtle)]">
            <p className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: ABHIBUS_ORANGE }}>
              Cross-marketplace view with Redbus Analytics
              <ArrowRight size={16} />
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
