import React from 'react'
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import ChartTooltip from './ChartTooltip'
import SectionHeader from './SectionHeader'
import { displayOperatorName, isFreshBus, operatorColor } from '../lib/marketplaceConfig'
import type { OperatorKpiRow } from '../lib/marketplaceMockData'

interface Props {
  rows: OperatorKpiRow[]
}

export default function CompetitiveScatter({ rows }: Props) {
  const data = rows.map(r => ({
    name: displayOperatorName(r.name),
    fullName: r.name,
    reviews: r.reviewCount,
    rating: r.overallRating,
    rank: r.competitiveRank,
    fill: isFreshBus(r.name) ? '#FFEA20' : operatorColor(r.name),
    z: isFreshBus(r.name) ? 120 : 70,
  }))

  const avgRating = rows.reduce((s, r) => s + r.overallRating, 0) / (rows.length || 1)
  const avgReviews = rows.reduce((s, r) => s + r.reviewCount, 0) / (rows.length || 1)

  return (
    <section className="liquid-glass chart-panel panel-shell">
      <SectionHeader
        eyebrow="Position map"
        title="Volume vs quality"
        subtitle="Top-right = high ratings with strong review volume. Each dot is one operator — size highlights FreshBus."
      />
      <div className="visual-body h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid className="chart-grid" />
            <XAxis
              type="number"
              dataKey="reviews"
              name="Reviews"
              tick={{ fontSize: 10, fontWeight: 700 }}
              label={{ value: 'Review volume', position: 'insideBottom', offset: -2, fontSize: 10, fontWeight: 700 }}
            />
            <YAxis
              type="number"
              dataKey="rating"
              name="Rating"
              domain={[3, 5]}
              tick={{ fontSize: 10, fontWeight: 700 }}
              label={{ value: 'Rating', angle: -90, position: 'insideLeft', fontSize: 10, fontWeight: 700 }}
            />
            <ZAxis type="number" dataKey="z" range={[60, 400]} />
            <ReferenceLine y={avgRating} stroke="var(--border-glow)" strokeDasharray="4 4" />
            <ReferenceLine x={avgReviews} stroke="var(--border-glow)" strokeDasharray="4 4" />
            <Tooltip content={<ChartTooltip />} />
            <Scatter data={data} name="Operators">
              {data.map(entry => (
                <Cell key={entry.fullName} fill={entry.fill} stroke={isFreshBus(entry.fullName) ? '#0f1d35' : 'transparent'} strokeWidth={2} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
