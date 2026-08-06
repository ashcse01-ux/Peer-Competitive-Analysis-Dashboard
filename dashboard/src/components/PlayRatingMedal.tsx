import React, { useId } from 'react'
import { cx } from '../lib/insights'

export type PodiumRank = 1 | 2 | 3

const PODIUM: Record<
  PodiumRank,
  {
    label: string
    w: number
    h: number
    metal: [string, string, string]
    rim: string
    ribbon: [string, string]
  }
> = {
  1: {
    label: 'Gold · highest App Rating',
    w: 20,
    h: 24,
    metal: ['#FFF8E1', '#FFCA28', '#F9A825'],
    rim: '#B8860B',
    ribbon: ['#FFE082', '#FFB300'],
  },
  2: {
    label: 'Silver · 2nd App Rating',
    w: 18,
    h: 22,
    metal: ['#FAFAFA', '#CFD8DC', '#90A4AE'],
    rim: '#78909C',
    ribbon: ['#ECEFF1', '#B0BEC5'],
  },
  3: {
    label: 'Bronze · 3rd App Rating',
    w: 17,
    h: 21,
    metal: ['#FFE0B2', '#FF8A65', '#D84315'],
    rim: '#A1887F',
    ribbon: ['#FFCCBC', '#FF7043'],
  },
}

interface Props {
  rank: PodiumRank
  className?: string
}

function MedalSvg({ rank }: { rank: PodiumRank }) {
  const uid = useId().replace(/:/g, '')
  const p = PODIUM[rank]
  const gid = `medal-metal-${rank}-${uid}`
  const rid = `medal-ribbon-${rank}-${uid}`

  return (
    <svg
      width={p.w}
      height={p.h}
      viewBox="0 0 20 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="block"
    >
      <defs>
        <linearGradient id={gid} x1="4" y1="10" x2="16" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor={p.metal[0]} />
          <stop offset="0.45" stopColor={p.metal[1]} />
          <stop offset="1" stopColor={p.metal[2]} />
        </linearGradient>
        <linearGradient id={rid} x1="0" y1="0" x2="20" y2="8" gradientUnits="userSpaceOnUse">
          <stop stopColor={p.ribbon[0]} />
          <stop offset="1" stopColor={p.ribbon[1]} />
        </linearGradient>
      </defs>
      {/* Ribbons */}
      <path
        d="M3.5 1.2 7.2 9.2 9.8 8.4 6.2 0.8Z"
        fill={`url(#${rid})`}
        stroke={p.rim}
        strokeWidth="0.35"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 1.2 12.8 9.2 10.2 8.4 13.8 0.8Z"
        fill={`url(#${rid})`}
        stroke={p.rim}
        strokeWidth="0.35"
        strokeLinejoin="round"
      />
      {/* Medal body */}
      <circle cx="10" cy="16.5" r="6.8" fill={`url(#${gid})`} stroke={p.rim} strokeWidth="0.65" />
      <circle cx="10" cy="16.5" r="5.1" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.45" />
      {/* Star */}
      <path
        d="M10 12.8 10.9 14.9 13.2 15.1 11.5 16.6 12 18.9 10 17.7 8 18.9 8.5 16.6 6.8 15.1 9.1 14.9Z"
        fill="rgba(255,255,255,0.85)"
        stroke={p.rim}
        strokeWidth="0.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Compact podium medal — gold (slightly largest) → silver → bronze. */
export default function PlayRatingMedal({ rank, className }: Props) {
  const p = PODIUM[rank]
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center', className)}
      title={p.label}
      aria-label={p.label}
    >
      <MedalSvg rank={rank} />
    </span>
  )
}

/** Top 3 operators by App Rating → podium rank. */
export function ratingRankMap(
  rows: { slug: string; rating: number | null }[],
): Map<string, PodiumRank> {
  const sorted = sortByPlayRating(rows)
  const out = new Map<string, PodiumRank>()
  sorted.slice(0, 3).forEach((row, i) => {
    out.set(row.slug, (i + 1) as PodiumRank)
  })
  return out
}

/** Gold → silver → bronze → rest (by rating, then name). */
export function sortByPlayRating<T extends { rating: number | null; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const diff = (b.rating ?? 0) - (a.rating ?? 0)
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name)
  })
}

export function podiumRowClass(rank: PodiumRank | undefined): string {
  if (rank === 1) return 'podium-row podium-row-gold'
  if (rank === 2) return 'podium-row podium-row-silver'
  if (rank === 3) return 'podium-row podium-row-bronze'
  return ''
}
