import React from 'react'
import { Sparkles } from 'lucide-react'
import { formatMetric } from '../lib/insights'
import { FB_BLUE, FB_YELLOW } from '../lib/playTopics'

export interface TopicLeader {
  key: string
  label: string
  operator: string
  slug: string
  color: string
  score: number | null
}

function ScoreRing({ score, color }: { score: number | null; color: string }) {
  const value = score ?? 0
  const pct = Math.max(0, Math.min(1, value / 5))
  const r = 22
  const c = 2 * Math.PI * r
  const dash = c * pct
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(15,29,53,0.08)" strokeWidth="5" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-theme-primary">
        {score != null ? formatMetric(score, 2) : '—'}
      </span>
    </div>
  )
}

/** Liquid-glass Play topic champions board — unique front-of-dashboard panel. */
export default function TopicChampionsBoard({ leaders }: { leaders: TopicLeader[] }) {
  return (
    <section className="topic-champions relative overflow-hidden rounded-2xl p-5 sm:p-6">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-70"
        style={{ background: `radial-gradient(circle, ${FB_YELLOW}55 0%, transparent 70%)` }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full opacity-60"
        style={{ background: `radial-gradient(circle, ${FB_BLUE}40 0%, transparent 68%)` }}
      />

      <header className="relative mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow inline-flex items-center gap-1.5" style={{ color: FB_BLUE }}>
            <Sparkles size={12} />
            Play Store Topic Crown
          </p>
          <h2
            className="mt-1 text-xl font-extrabold tracking-tight text-theme-primary sm:text-2xl"
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
          >
            Who owns each of the 10 KPIs?
          </h2>
          <p className="mt-1 max-w-xl text-sm text-theme-secondary">
            Live leader per Google Play review topic - score out of 5.
          </p>
        </div>
        <div
          className="rounded-full px-3 py-1.5 text-xs font-extrabold text-[#0f1d35]"
          style={{ background: FB_YELLOW, boxShadow: '0 6px 18px rgba(251,188,4,0.35)' }}
        >
          10 topics - peer crown
        </div>
      </header>

      <div className="relative grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {leaders.map((t, idx) => (
          <article
            key={t.key}
            className="topic-tile group relative flex flex-col gap-3 rounded-2xl p-3.5 transition duration-300 hover:-translate-y-1"
            style={{ animationDelay: `${idx * 40}ms` }}
          >
            <div className="flex items-start justify-between gap-2">
              <ScoreRing score={t.score} color={t.slug === 'freshbus' ? FB_YELLOW : t.color} />
              <span
                className="rounded-md px-1.5 py-0.5 text-[0.62rem] font-black uppercase tracking-wide"
                style={{
                  background: t.slug === 'freshbus' ? 'rgba(251,188,4,0.22)' : 'rgba(12,77,195,0.1)',
                  color: t.slug === 'freshbus' ? '#92650a' : FB_BLUE,
                }}
              >
                #{idx + 1}
              </span>
            </div>
            <div>
              <p className="text-[0.72rem] font-bold uppercase tracking-wide text-theme-muted">{t.label}</p>
              <p className="mt-1 truncate text-sm font-extrabold text-theme-primary">{t.operator}</p>
            </div>
            <div className="mt-auto h-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.max(8, ((t.score ?? 0) / 5) * 100)}%`,
                  background: `linear-gradient(90deg, ${FB_BLUE}, ${FB_YELLOW})`,
                }}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
