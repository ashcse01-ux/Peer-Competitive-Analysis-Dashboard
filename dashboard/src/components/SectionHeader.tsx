import React from 'react'
import { cx } from '../lib/insights'
import MetricTip from './MetricTip'

interface Props {
  eyebrow?: string
  title: string
  subtitle?: string
  subtitleNode?: React.ReactNode
  eyebrowTip?: string
  titleTip?: string
  trailing?: React.ReactNode
  variant?: 'hero' | 'panel'
  divider?: boolean
  className?: string
}

export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  subtitleNode,
  eyebrowTip,
  titleTip,
  trailing,
  variant = 'panel',
  divider,
  className,
}: Props) {
  const showDivider = divider ?? variant === 'panel'
  const isHero = variant === 'hero'

  return (
    <header
      className={cx(
        'panel-header',
        isHero && 'panel-header--hero',
        showDivider && 'panel-header--divider',
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="panel-header-copy min-w-0 flex-1">
          {eyebrow ? (
            <MetricTip tip={eyebrowTip ?? ''} as="p" className={isHero ? 'panel-kicker panel-kicker-hero' : 'panel-kicker'}>
              {eyebrow}
            </MetricTip>
          ) : null}

          <MetricTip
            tip={titleTip ?? ''}
            as="h2"
            className={isHero ? 'section-title-hero' : 'section-title'}
          >
            {title}
          </MetricTip>

          {subtitleNode ?? (subtitle ? (
            <p className={isHero ? 'hero-lede' : 'chart-subtitle'}>{subtitle}</p>
          ) : null)}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </header>
  )
}
