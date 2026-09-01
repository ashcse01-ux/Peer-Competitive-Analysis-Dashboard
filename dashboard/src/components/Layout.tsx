import React from 'react'
import { NavLink } from 'react-router-dom'
import { Activity, BarChart3, Bus, Globe, Map, MessageSquare, Moon, Play, Smartphone, Sun } from 'lucide-react'
import { useRefreshStatus } from '../api'
import { LANG_OPTIONS } from '../i18n/translations'
import { useTranslation } from '../i18n/useTranslation'
import { useDashboardStore } from '../store'
import { cx } from '../lib/insights'
import BrandLockup from './BrandLockup'
import MugChatbot from './MugChatbot'
import { FB_BLUE } from '../lib/playTopics'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data: refresh } = useRefreshStatus()
  const { t } = useTranslation()
  const { theme, toggleTheme, language, setLanguage } = useDashboardStore()

  const NAV_LINKS = [
    { to: '/', label: t('nav.overview'), icon: BarChart3, end: true },
    { to: '/google-play', label: t('nav.googlePlay'), icon: Play },
    { to: '/apple-store', label: t('nav.appleStore'), icon: Smartphone },
    { to: '/google-reviews', label: t('nav.google'), icon: MessageSquare },
    { to: '/redbus', label: t('nav.redbus'), icon: Map },
    { to: '/abhibus', label: t('nav.abhibus'), icon: Bus },
  ]

  const isStale = refresh?.status === 'stale' || refresh?.status === 'loading'

  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-40"
        style={{
          background: FB_BLUE,
          boxShadow: '0 4px 15px rgba(12,77,195,0.25)',
        }}
      >
        <div className="mx-auto flex max-w-[1560px] flex-col gap-3 px-4 py-2.5 sm:px-6 lg:flex-row lg:items-center lg:gap-5 lg:px-8 lg:py-3">
          <div className="flex w-full items-center justify-between gap-3 lg:w-auto lg:shrink-0">
            <BrandLockup />

            <div className="flex items-center gap-2 lg:hidden">
              <button type="button" className="icon-button border-white/25 bg-white/10 text-white" onClick={toggleTheme} aria-label="Toggle theme">
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
            </div>
          </div>

          <nav className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 lg:pb-0">
            {NAV_LINKS.map(link => {
              const Icon = link.icon
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={'end' in link ? link.end : link.to === '/'}
                  className={({ isActive }) =>
                    cx(
                      'inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition',
                      isActive
                        ? 'nav-pill-active'
                        : 'border border-white/20 bg-white/10 text-white hover:bg-white/20',
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
              <Globe size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/70" />
              <select
                className="h-9 appearance-none rounded-full border border-white/20 bg-white/10 pl-8 pr-7 text-xs font-bold text-white outline-none transition focus:border-white/50"
                value={language}
                onChange={e => setLanguage(e.target.value as typeof language)}
                aria-label="Language"
              >
                {LANG_OPTIONS.map(opt => (
                  <option key={opt.code} value={opt.code} className="text-[#0f1d35]">{opt.native}</option>
                ))}
              </select>
            </div>

            <button type="button" className="icon-button border-white/25 bg-white/10 text-white" onClick={toggleTheme} aria-label="Toggle theme" title={theme === 'light' ? t('theme.dark') : t('theme.light')}>
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            {isStale && (
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/50 bg-amber-400/20 px-3 py-2 text-xs font-bold text-amber-100">
                <Activity size={14} />
                {t('status.stale')}
              </span>
            )}
          </div>
        </div>
      </header>

      {isStale && (
        <div className="border-b border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-600 sm:px-6 lg:px-8">
          {t('status.staleBanner')}: {(refresh?.stale_sources ?? []).join(', ') || 'Unknown'}
        </div>
      )}

      <main className="mx-auto w-full max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
      <MugChatbot />
    </div>
  )
}
