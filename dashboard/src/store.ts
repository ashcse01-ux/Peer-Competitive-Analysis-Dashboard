/**
 * store.ts — Zustand global UI state
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from './i18n/translations'

export type Theme = 'light' | 'dark'

interface DashboardStore {
  selectedOperator: string | null
  setSelectedOperator: (slug: string | null) => void

  selectedRoute: number | null
  setSelectedRoute: (id: number | null) => void

  dateRange: { from: string | null; to: string | null }
  setDateRange: (from: string | null, to: string | null) => void

  activeRouteFilter: number | null
  setActiveRouteFilter: (id: number | null) => void

  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void

  language: Lang
  setLanguage: (lang: Lang) => void
}

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set, get) => ({
      selectedOperator: null,
      setSelectedOperator: (slug) => set({ selectedOperator: slug }),

      selectedRoute: null,
      setSelectedRoute: (id) => set({ selectedRoute: id }),

      dateRange: { from: null, to: null },
      setDateRange: (from, to) => set({ dateRange: { from, to } }),

      activeRouteFilter: null,
      setActiveRouteFilter: (id) => set({ activeRouteFilter: id }),

      theme: 'light',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme)
        set({ theme })
      },
      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light'
        document.documentElement.setAttribute('data-theme', next)
        set({ theme: next })
      },

      language: 'en',
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'freshbus-dashboard',
      partialize: (state) => ({ theme: state.theme, language: state.language }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          document.documentElement.setAttribute('data-theme', state.theme)
        }
      },
    },
  ),
)
