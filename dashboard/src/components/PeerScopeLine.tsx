import React from 'react'
import { cx } from '../lib/insights'

export interface PeerOperator {
  slug: string
  name: string
  color: string
}

interface Props {
  peers: PeerOperator[]
  selectedSlug: string | null
  onSelect: (slug: string | null) => void
  className?: string
}

/** Hero operator filter - All + peer chips (replaces separate chip row). */
export default function PeerScopeLine({ peers, selectedSlug, onSelect, className }: Props) {
  const isAll = selectedSlug == null

  return (
    <div className={className}>
      <p className="hero-lede-label">Select operator</p>
      <div className="hero-peer-row" role="group" aria-label="Filter by bus operator">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cx('hero-peer-chip hero-peer-chip-all', isAll && 'hero-peer-chip-active')}
          aria-pressed={isAll}
        >
          All
        </button>
        {peers.map(p => {
          const active = selectedSlug === p.slug
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => onSelect(active ? null : p.slug)}
              className={cx('hero-peer-chip', active && 'hero-peer-chip-active')}
              aria-pressed={active}
            >
              <span className="hero-peer-dot" style={{ backgroundColor: p.color }} aria-hidden />
              {p.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
