import React from 'react'
import { cx } from '../lib/insights'

interface Props {
  tip: string
  children: React.ReactNode
  className?: string
  as?: 'span' | 'p' | 'th' | 'label'
}

export default function MetricTip({ tip, children, className, as: Tag = 'span' }: Props) {
  if (!tip) return <>{children}</>

  return (
    <Tag
      className={cx('metric-tip', className)}
      data-tip={tip}
      tabIndex={0}
      aria-label={`${typeof children === 'string' ? children : ''}. ${tip}`}
    >
      {children}
    </Tag>
  )
}
