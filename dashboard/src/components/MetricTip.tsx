import React from 'react'
import { cx } from '../lib/insights'

type TagName = 'span' | 'p' | 'th' | 'label' | 'h2' | 'h3'

interface Props {
  tip: string
  children: React.ReactNode
  className?: string
  as?: TagName
}

export default function MetricTip({ tip, children, className, as: Tag = 'span' }: Props) {
  if (!tip) {
    return <Tag className={className}>{children}</Tag>
  }

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
