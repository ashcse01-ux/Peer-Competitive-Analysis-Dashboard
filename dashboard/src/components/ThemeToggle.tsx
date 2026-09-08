import React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useDashboardStore } from '../store'
import { cx } from '../lib/insights'

interface Props {
  className?: string
  /** Compact icon-only control (nav bar). */
  compact?: boolean
}

export default function ThemeToggle({ className, compact = false }: Props) {
  const { theme, setTheme, toggleTheme } = useDashboardStore()

  if (compact) {
    return (
      <button
        type="button"
        className={cx('icon-button border-white/25 bg-white/10 text-white', className)}
        onClick={toggleTheme}
        aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        title={theme === 'light' ? 'Dark theme' : 'Light theme'}
      >
        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
      </button>
    )
  }

  return (
    <div className={cx('theme-toggle', className)} role="group" aria-label="Theme">
      <button
        type="button"
        className={cx('theme-toggle__btn', theme === 'light' && 'theme-toggle__btn--on')}
        onClick={() => setTheme('light')}
        aria-pressed={theme === 'light'}
      >
        <Sun size={14} strokeWidth={2.4} />
        Light
      </button>
      <button
        type="button"
        className={cx('theme-toggle__btn', theme === 'dark' && 'theme-toggle__btn--on')}
        onClick={() => setTheme('dark')}
        aria-pressed={theme === 'dark'}
      >
        <Moon size={14} strokeWidth={2.4} />
        Dark
      </button>
    </div>
  )
}
