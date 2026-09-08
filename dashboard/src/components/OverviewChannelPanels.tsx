import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Compass, Map, MessageSquare, Smartphone, Star } from 'lucide-react'
import HighestRatedCard from './HighestRatedCard'
import KPICard from './KPICard'
import SectionHeader from './SectionHeader'
import TopicChampionsBoard from './TopicChampionsBoard'
import { useOverviewChannelData } from '../lib/overviewChannelData'
import { formatMetric, formatStarRating } from '../lib/insights'
import { FB_BLUE, FB_YELLOW } from '../lib/playTopics'

function DashboardLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide transition hover:opacity-80"
      style={{ color: FB_BLUE }}
    >
      {label}
      <ArrowRight size={14} />
    </Link>
  )
}

export default function OverviewChannelPanels() {
  const ch = useOverviewChannelData()

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        variant="hero"
        divider={false}
        eyebrow="Channel highlights"
        title="What each dashboard is showing"
        subtitle="FreshBus snapshot and peer leaders across Google Play, Apple iOS, Google Reviews, Redbus, and Abhibus."
      />

      <div className="liquid-glass chart-panel panel-shell overflow-hidden">
        <SectionHeader
          eyebrow="FreshBus"
          title="Performance across all channels"
          subtitle="Quick read before you drill into a single source."
        />
        <div className="visual-body grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KPICard
            label="Google Play Store rating"
            value={formatStarRating(ch.freshbusChannel.playRating)}
            caption="Google Play Store"
            icon={<Smartphone size={20} />}
            accent={FB_YELLOW}
          />
          <KPICard
            label="Apple iOS Store rating"
            value={formatStarRating(ch.freshbusChannel.iosRating)}
            caption="Apple iOS Store"
            icon={<Smartphone size={20} />}
            accent={FB_BLUE}
          />
          <KPICard
            label="Google Reviews rating"
            value={formatStarRating(ch.freshbusChannel.googleRating)}
            caption="Knowledge panel reviews"
            icon={<Star size={20} />}
            accent={FB_YELLOW}
          />
          <KPICard
            label="Redbus route rating"
            value={formatMetric(ch.freshbusChannel.redbusRating, 2)}
            caption={`${ch.freshbusRouteLeads} route leads · ${ch.routeCount} corridors`}
            icon={<Map size={20} />}
            accent={FB_BLUE}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader
          eyebrow="Google Play Store"
          title="Play Store highlights"
          subtitle="Highest rated operator and topic champions from the Play dashboard."
          trailing={<DashboardLink to="/google-play" label="Open Play Store" />}
          className="panel-header--divider"
        />
        <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.9fr)_minmax(0,2.1fr)]">
          <HighestRatedCard
            name={ch.playLeader?.name}
            rating={ch.playLeader?.rating}
            color={ch.playLeader?.color}
            ratingCaption="Google Play Store App Rating"
          />
          <TopicChampionsBoard leaders={ch.topicLeaders} />
        </div>
        <p className="text-sm font-semibold text-theme-secondary">
          FreshBus leads{' '}
          <span className="font-extrabold tabular-nums" style={{ color: FB_BLUE }}>
            {ch.fbTopicWins}
          </span>{' '}
          of {ch.topicLeaders.length} Play review topics.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <SectionHeader
            eyebrow="Apple iOS Store"
            title="iOS Store highlights"
            subtitle="Highest rated operator on the Apple iOS Store."
            trailing={<DashboardLink to="/apple-store" label="Open iOS Store" />}
            className="panel-header--divider"
          />
          <HighestRatedCard
            name={ch.iosLeader?.name}
            rating={ch.iosLeader?.rating}
            color={ch.iosLeader?.color}
            ratingCaption="Apple iOS Store App Rating"
          />
        </div>

        <div className="flex flex-col gap-4">
          <SectionHeader
            eyebrow="Google Reviews"
            title="Review highlights"
            subtitle="Highest rated operator in Google Reviews."
            trailing={<DashboardLink to="/google-reviews" label="Open Google Reviews" />}
            className="panel-header--divider"
          />
          <HighestRatedCard
            name={ch.googleLeader?.name}
            rating={ch.googleLeader?.rating}
            color={ch.googleLeader?.color}
            ratingCaption={ch.googleRatingLabel}
          />
        </div>
      </div>

      <div className="liquid-glass chart-panel panel-shell overflow-hidden">
        <SectionHeader
          eyebrow="Redbus Analytics"
          title="Route review highlights"
          subtitle="Tag leaderboard, FreshBus standing, and operator averages on corridors."
          trailing={
            <div className="flex flex-wrap items-center gap-4">
              <DashboardLink to="/redbus" label="SRP Tracker" />
            </div>
          }
        />
        <div className="visual-body grid gap-4 sm:grid-cols-3">
          <KPICard
            label="Tag composite leader"
            value={ch.tagLeader?.operator_name ?? '—'}
            caption={ch.tagLeader ? `Score ${formatMetric(ch.tagLeader.composite_tag_score, 2)}` : 'Tag data loading'}
            icon={<MessageSquare size={20} />}
            accent={FB_YELLOW}
          />
          <KPICard
            label="FreshBus tag rank"
            value={ch.freshbusTags?.rank != null ? `#${ch.freshbusTags.rank}` : '—'}
            caption={
              ch.freshbusTags
                ? `Composite ${formatMetric(ch.freshbusTags.composite_tag_score, 2)}`
                : 'Across 9 review dimensions'
            }
            icon={<Star size={20} />}
            accent={FB_BLUE}
          />
          <KPICard
            label="Route rating leader"
            value={ch.redbusRatingLeader?.name ?? '—'}
            caption={
              ch.redbusRatingLeader?.avgRating != null
                ? `Avg ${formatMetric(ch.redbusRatingLeader.avgRating, 2)} on network`
                : `${ch.routeCount} routes tracked`
            }
            icon={<Map size={20} />}
            accent={FB_YELLOW}
          />
        </div>
        {ch.redbusOps.length > 0 && (
          <div className="visual-body overflow-x-auto border-t border-[var(--border-subtle)]">
            <table className="data-table min-w-[520px]">
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>Avg route rating</th>
                  <th>Avg rank</th>
                </tr>
              </thead>
              <tbody>
                {[...ch.redbusOps]
                  .sort((a, b) => (a.avgRank ?? 99) - (b.avgRank ?? 99))
                  .slice(0, 6)
                  .map(op => (
                    <tr key={op.slug}>
                      <td>
                        <span className="inline-flex items-center gap-2 font-bold text-theme-primary">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: op.color }} />
                          {op.name}
                        </span>
                      </td>
                      <td className="font-semibold tabular-nums">{formatMetric(op.avgRating, 2)}</td>
                      <td className="font-semibold tabular-nums" style={{ color: FB_BLUE }}>
                        #{formatMetric(op.avgRank, 1)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="liquid-glass chart-panel panel-shell overflow-hidden">
        <SectionHeader
          eyebrow="Abhibus Analytics"
          title="Cross-marketplace intelligence"
          subtitle="Route reviews and SRP tracking for the Abhibus marketplace — preview the upcoming integration."
          trailing={<DashboardLink to="/abhibus/kpis" label="Open Abhibus KPIs" />}
        />
        <div className="visual-body grid gap-4 sm:grid-cols-3">
          <KPICard
            label="Integration status"
            value="Preview"
            caption="Scraper pipeline in progress"
            icon={<Compass size={20} />}
            accent="#E85D04"
          />
          <KPICard
            label="Planned corridors"
            value="24+"
            caption="Aligned with Redbus route network"
            icon={<Map size={20} />}
            accent="#E85D04"
          />
          <KPICard
            label="Review dimensions"
            value="9"
            caption="Same tag taxonomy as Redbus"
            icon={<MessageSquare size={20} />}
            accent="#E85D04"
          />
        </div>
      </div>
    </section>
  )
}
