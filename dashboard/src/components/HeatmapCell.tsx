import React, { useId } from 'react'
import { clamp } from '../lib/insights'

interface Props {
  value: number | null | undefined
  min?: number
  max?: number
  width?: number
  height?: number
  label?: string
  onClick?: () => void
  showValue?: boolean
}

function heatColor(value: number, min: number, max: number): string {
  const t = clamp((value - min) / (max - min || 1), 0, 1)
  if (t < 0.5) {
    const mix = t / 0.5
    const r = Math.round(244 + (255 - 244) * mix)
    const g = Math.round(93 + (176 - 93) * mix)
    const b = Math.round(72 + (0 - 72) * mix)
    return `rgb(${r}, ${g}, ${b})`
  }
  const mix = (t - 0.5) / 0.5
  const r = Math.round(255 + (0 - 255) * mix)
  const g = Math.round(176 + (166 - 176) * mix)
  const b = Math.round(0 + (118 - 0) * mix)
  return `rgb(${r}, ${g}, ${b})`
}

export default function HeatmapCell({
  value,
  min = -1,
  max = 1,
  width = 64,
  height = 28,
  label,
  onClick,
  showValue = false,
}: Props) {
  const rawId = useId()
  const patternId = `hatch-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const isNull = value == null || !Number.isFinite(value)
  const fill = isNull ? '#e6ece9' : heatColor(value as number, min, max)
  const text = isNull ? 'No data' : (value as number).toFixed(Math.abs(value as number) > 10 ? 0 : 2)

  return (
    <svg
      width={width}
      height={height}
      className={onClick ? 'cursor-pointer transition hover:brightness-105' : undefined}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={label ?? text}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={event => {
        if (!onClick) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
    >
      <title>{label ?? text}</title>
      <defs>
        <pattern id={patternId} patternUnits="userSpaceOnUse" width="7" height="7">
          <path d="M-1 7 L7 -1 M3 8 L8 3" stroke="#a9b5b1" strokeWidth="1.1" />
        </pattern>
      </defs>
      <rect x="0.5" y="0.5" width={width - 1} height={height - 1} fill={fill} rx="7" />
      {isNull && <rect x="0.5" y="0.5" width={width - 1} height={height - 1} fill={`url(#${patternId})`} rx="7" />}
      <rect x="0.5" y="0.5" width={width - 1} height={height - 1} fill="transparent" stroke="rgba(20,33,31,0.12)" rx="7" />
      {showValue && !isNull && (
        <text
          x={width / 2}
          y={height / 2 + 4}
          textAnchor="middle"
          fontSize="10"
          fontWeight="800"
          fill="rgba(20,33,31,0.78)"
        >
          {text}
        </text>
      )}
    </svg>
  )
}
