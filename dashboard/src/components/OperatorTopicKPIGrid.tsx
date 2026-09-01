import React from 'react'
import KPICard from './KPICard'
import { formatMetric } from '../lib/insights'
import { FB_BLUE, FB_YELLOW, PLAY_TOPIC_LABELS, type PlayTopicKey } from '../lib/playTopics'

interface Props {
  operatorName: string
  topicKeys: PlayTopicKey[]
  scores: Record<string, number | null | undefined>
  accent?: string
}

/** Per-operator Google Play topic KPI cards (only topics with real scores). */
export default function OperatorTopicKPIGrid({ operatorName, topicKeys, scores, accent = FB_BLUE }: Props) {
  if (!topicKeys.length) {
    return (
      <div className="liquid-glass rounded-2xl p-5 text-sm font-semibold text-theme-muted">
        No review-topic KPIs available for {operatorName} yet — topics appear once Play Store reviews mention them.
      </div>
    )
  }

  return (
    <section className="liquid-glass chart-panel panel-shell overflow-hidden">
      <header className="panel-header panel-header--divider">
        <div className="panel-header-copy">
          <p className="panel-kicker">Google Play review topics</p>
          <h2 className="section-title">{operatorName} — topic KPIs</h2>
          <p className="chart-subtitle">
            All {topicKeys.length} topic scores available for this operator from Play Store review analysis.
          </p>
        </div>
      </header>
      <div className="visual-body grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {topicKeys.map((key, i) => (
          <KPICard
            key={key}
            label={PLAY_TOPIC_LABELS[key]}
            value={formatMetric(scores[key], 2)}
            caption="Score out of 5"
            accent={i % 2 === 0 ? accent : FB_YELLOW}
          />
        ))}
      </div>
    </section>
  )
}
