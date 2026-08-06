import React from 'react'
import { Trophy } from 'lucide-react'
import { formatStarRating } from '../lib/insights'
import { FB_BLUE, FB_YELLOW } from '../lib/playTopics'

interface Props {
  name: string | null | undefined
  rating: number | null | undefined
  color?: string
}

/** Premium glass champion card for highest-rated operator. */
export default function HighestRatedCard({ name, rating, color = FB_BLUE }: Props) {
  return (
    <article className="highest-rated-card relative flex h-full min-h-[200px] flex-col overflow-hidden rounded-2xl p-5 sm:p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background: `
            radial-gradient(circle at 90% 10%, rgba(251,188,4,0.45) 0%, transparent 42%),
            radial-gradient(circle at 10% 90%, rgba(12,77,195,0.28) 0%, transparent 45%),
            linear-gradient(160deg, rgba(255,255,255,0.78), rgba(232,240,255,0.55))
          `,
        }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <p className="eyebrow" style={{ color: FB_BLUE }}>Peer leader</p>
        <span
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-[#0f1d35] shadow-lg"
          style={{ background: FB_YELLOW, boxShadow: '0 10px 28px rgba(251,188,4,0.4)' }}
        >
          <Trophy size={22} strokeWidth={2.4} />
        </span>
      </div>
      <p
        className="relative mt-4 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-theme-muted"
      >
        Highest Rated Bus Operator
      </p>
      <p
        className="relative mt-2 text-3xl font-extrabold tracking-tight text-theme-primary sm:text-4xl"
        style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
      >
        {name ?? '—'}
      </p>
      <div className="relative mt-auto flex items-end justify-between gap-3 pt-6">
        <div>
          <p className="text-4xl font-black tracking-tight" style={{ color: FB_BLUE }}>
            {formatStarRating(rating)}
          </p>
          <p className="mt-1.5 text-xs font-bold uppercase tracking-[0.06em] text-theme-muted">
            Google Play Store App Rating
          </p>
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(i => (
            <span
              key={i}
              className="text-lg"
              style={{ color: rating != null && i <= Math.round(rating) ? FB_YELLOW : 'rgba(15,29,53,0.15)' }}
            >
              ★
            </span>
          ))}
        </div>
      </div>
      <div
        className="absolute bottom-0 left-0 right-0 h-1.5"
        style={{ background: `linear-gradient(90deg, ${FB_BLUE}, ${FB_YELLOW})` }}
      />
    </article>
  )
}
