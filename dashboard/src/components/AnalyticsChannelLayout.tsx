import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import MarketplaceFilterBar from './MarketplaceFilterBar'
import RedbusGlobalHeader from './RedbusGlobalHeader'
import { MarketplaceFilterProvider } from '../context/MarketplaceFilterContext'
import { cx } from '../lib/insights'
import { FB_BLUE } from '../lib/playTopics'

export interface ChannelTab {
  to: string
  label: string
  icon?: React.ReactNode
  end?: boolean
}

interface Props {
  title?: string
  eyebrow?: string
  subtitle?: string
  tabs: ChannelTab[]
  accent?: string
  redbusSpec?: boolean
  marketplaceSync?: {
    label: string
    kpiChannel: string
    srpChannel: string
  }
}

export default function AnalyticsChannelLayout({
  title,
  eyebrow,
  subtitle,
  tabs,
  accent = FB_BLUE,
  redbusSpec = false,
  marketplaceSync,
}: Props) {
  const content = (
    <>
      {redbusSpec ? (
        <RedbusGlobalHeader />
      ) : eyebrow || title ? (
        <header className="mb-2 space-y-1">
          {eyebrow ? (
            <p className="text-xs font-black uppercase tracking-wider text-theme-muted">{eyebrow}</p>
          ) : null}
          {title ? <h1 className="page-title text-2xl sm:text-3xl">{title}</h1> : null}
          {subtitle ? <p className="chart-subtitle max-w-3xl">{subtitle}</p> : null}
        </header>
      ) : null}

      <nav
        className="channel-subnav mb-4 flex gap-2 overflow-x-auto pb-1"
        aria-label="Redbus Analytics sections"
        style={{ '--channel-accent': accent } as React.CSSProperties}
      >
        {tabs.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cx(
                'channel-subnav-pill inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-5 text-sm font-bold uppercase tracking-wide transition',
                isActive ? 'channel-subnav-pill-active' : 'channel-subnav-pill-idle',
              )
            }
          >
            {tab.icon}
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {marketplaceSync ? <MarketplaceFilterBar /> : null}

      <Outlet />
    </>
  )

  return (
    <div className="page-section">
      {marketplaceSync ? (
        <MarketplaceFilterProvider>{content}</MarketplaceFilterProvider>
      ) : (
        content
      )}
    </div>
  )
}
