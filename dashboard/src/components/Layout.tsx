import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Activity, BarChart3, Bus, Globe, Map, Moon, RefreshCw, Search, Smartphone, Sun } from 'lucide-react'
import { useRefreshStatus, useTriggerRefresh } from '../api'
import { LANG_OPTIONS } from '../i18n/translations'
import { useTranslation } from '../i18n/useTranslation'
import { useDashboardStore } from '../store'
import { cx } from '../lib/insights'
import MetricTip from './MetricTip'
import { tip } from '../lib/metricGlossary'
import MugChatbot from './MugChatbot'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data: refresh, isFetching } = useRefreshStatus()
  const triggerRefresh = useTriggerRefresh()
  const { t } = useTranslation()
  const { theme, toggleTheme, language, setLanguage } = useDashboardStore()
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  const NAV_LINKS = [
    { to: '/', label: t('nav.overview'), icon: BarChart3 },
    { to: '/google-play', label: t('nav.googlePlay'), icon: Smartphone },
    { to: '/apple-store', label: t('nav.appleStore'), icon: Smartphone },
    { to: '/google-reviews', label: t('nav.google'), icon: Search },
    { to: '/redbus', label: t('nav.redbus'), icon: Map },
  ]

  const isStale = refresh?.status === 'stale' || refresh?.status === 'loading'
  const isRefreshing = triggerRefresh.isPending || refresh?.status === 'loading'
  const lastRefresh = refresh?.completed_at
    ? new Date(refresh.completed_at).toLocaleString()
    : 'Pending'

  const handleRefresh = async () => {
    setRefreshMsg(null)
    try {
      const res = await triggerRefresh.mutateAsync()
      setRefreshMsg(res.message)
    } catch {
      setRefreshMsg('Refresh could not be started.')
    }
  }

  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-2xl"
        style={{
          borderColor: 'var(--border-subtle)',
          background: 'var(--header-bg)',
        }}
      >
        <div className="mx-auto flex max-w-[1560px] flex-col gap-4 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-6 lg:px-8">
          <div className="flex min-w-0 items-center justify-between gap-4">
            <NavLink to="/" className="group flex min-w-0 items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, #0077ff, #00d4ff 50%, #ffea00)',
                  boxShadow: '0 8px 32px rgba(0, 212, 255, 0.35)',
                }}
              >
                <Bus size={22} strokeWidth={2.4} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-black tracking-tight text-theme-primary">
                  {t('app.title')}
                </span>
                <span className="block truncate text-xs font-semibold text-theme-muted">
                  {t('app.subtitle')}
                </span>
              </span>
            </NavLink>

            <div className="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                className="icon-button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                aria-label={t('status.refresh')}
              >
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              </button>
              <select
                className="h-9 max-w-[5.5rem] appearance-none rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs font-bold text-theme-primary outline-none"
                value={language}
                onChange={e => setLanguage(e.target.value as typeof language)}
                aria-label="Language"
              >
                {LANG_OPTIONS.map(opt => (
                  <option key={opt.code} value={opt.code}>{opt.code.toUpperCase()}</option>
                ))}
              </select>
              <button type="button" className="icon-button" onClick={toggleTheme} aria-label="Toggle theme">
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
            </div>
          </div>

          <nav className="no-scrollbar flex gap-2 overflow-x-auto pb-1 lg:pb-0">
            {NAV_LINKS.map(link => {
              const Icon = link.icon
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) =>
                    cx(
                      'inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition',
                      isActive
                        ? 'nav-pill-active'
                        : 'border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-theme-secondary hover:border-[var(--border-glow)] hover:text-theme-primary',
                    )
                  }
                >
                  <Icon size={16} strokeWidth={2.2} />
                  {link.label}
                </NavLink>
              )
            })}
          </nav>

          <div className="hidden min-w-fit items-center gap-2 lg:ml-auto lg:flex">
            <div className="relative">
              <Globe size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
              <select
                className="h-9 appearance-none rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-8 pr-7 text-xs font-bold text-theme-primary outline-none transition focus:border-[var(--border-glow)]"
                value={language}
                onChange={e => setLanguage(e.target.value as typeof language)}
                aria-label="Language"
              >
                {LANG_OPTIONS.map(opt => (
                  <option key={opt.code} value={opt.code}>{opt.native}</option>
                ))}
              </select>
            </div>

            <button type="button" className="icon-button" onClick={toggleTheme} aria-label="Toggle theme" title={theme === 'light' ? t('theme.dark') : t('theme.light')}>
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            <MetricTip tip={tip('manualRefresh')}>
              <button
                type="button"
                className={cx(
                  'icon-button',
                  isRefreshing && 'pointer-events-none opacity-70',
                )}
                onClick={handleRefresh}
                disabled={isRefreshing}
                aria-label={t('status.refresh')}
              >
                <RefreshCw size={16} className={isRefreshing || isFetching ? 'animate-spin' : ''} />
              </button>
            </MetricTip>

            <span className={cx(
              'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold',
              isStale ? 'border-amber-400/40 bg-amber-500/10 text-amber-500' : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-500',
            )}>
              <Activity size={14} />
              {isStale ? t('status.stale') : t('status.live')}
            </span>
            <MetricTip tip={tip('lastRefresh')} className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-theme-muted">
              <RefreshCw size={14} />
              {lastRefresh}
            </MetricTip>
          </div>
        </div>
      </header>

      {isStale && (
        <div className="border-b border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-600 sm:px-6 lg:px-8">
          {t('status.staleBanner')}: {(refresh?.stale_sources ?? []).join(', ') || 'Unknown'}
        </div>
      )}

      {refreshMsg && (
        <div className="border-b border-[var(--border-glow)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-semibold text-theme-secondary sm:px-6 lg:px-8">
          {refreshMsg}
        </div>
      )}

      <main className="mx-auto w-full max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
      <MugChatbot />
    </div>
  )
}
