import React from 'react'
import MetricTip from './MetricTip'

interface Props {
  eyebrow: string
  title: string
  subtitle?: string
  eyebrowTip?: string
  titleTip?: string
  trailing?: React.ReactNode
}

export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  eyebrowTip,
  titleTip,
  trailing,
}: Props) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <MetricTip tip={eyebrowTip ?? ''} as="p" className="eyebrow">
          {eyebrow}
        </MetricTip>
        <MetricTip tip={titleTip ?? ''} as="p" className="section-title mt-1">
          {title}
        </MetricTip>
        {subtitle && <p className="chart-subtitle mt-1">{subtitle}</p>}
      </div>
      {trailing}
    </div>
  )
}
