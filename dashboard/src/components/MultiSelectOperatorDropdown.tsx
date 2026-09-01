import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cx } from '../lib/insights'
import { displayOperatorName } from '../lib/marketplaceConfig'

interface Props {
  label?: string
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  className?: string
  /** Max trigger width in px when compact (default 152) */
  maxTriggerWidth?: number
  /** Dropdown panel width in px (default 216) */
  panelWidth?: number
  formatOption?: (value: string) => string
  searchPlaceholder?: string
  compact?: boolean
}

export default function MultiSelectOperatorDropdown({
  label = 'Operators',
  options,
  selected,
  onChange,
  className,
  maxTriggerWidth = 152,
  panelWidth = 216,
  formatOption = displayOperatorName,
  searchPlaceholder = 'Search…',
  compact = true,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.toLowerCase().includes(q) || formatOption(o).toLowerCase().includes(q))
  }, [options, query, formatOption])

  const allSelected = options.length > 0 && selected.length === options.length
  const noneSelected = selected.length === 0

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter(s => s !== name))
    else onChange([...selected, name])
  }

  const selectAll = () => onChange([...options])
  const clearAll = () => onChange([])

  const summary = allSelected
    ? `All (${options.length})`
    : noneSelected
      ? 'None'
      : `${selected.length} picked`

  return (
    <div
      ref={rootRef}
      className={cx('filter-field', compact && 'filter-field--compact', className)}
      style={{ '--filter-trigger-max': `${maxTriggerWidth}px`, '--filter-panel-w': `${panelWidth}px` } as React.CSSProperties}
    >
      {label ? <span className="filter-field-label">{label}</span> : null}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="filter-chip-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        title={summary}
      >
        <span className="filter-chip-value">{summary}</span>
        <ChevronDown size={14} className={cx('filter-chip-chevron', open && 'filter-chip-chevron--open')} />
      </button>

      {open ? (
        <div className="filter-chip-panel">
          <div className="filter-chip-panel-head">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-theme-muted" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="filter-chip-search"
                autoFocus
              />
              {query ? (
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-theme-muted" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={13} />
                </button>
              ) : null}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <button type="button" onClick={selectAll} className="filter-chip-action filter-chip-action--primary">
                All
              </button>
              <button type="button" onClick={clearAll} className="filter-chip-action">
                Clear
              </button>
            </div>
          </div>

          <ul className="filter-chip-list" role="listbox" aria-multiselectable>
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-center text-xs font-semibold text-theme-muted">No matches</li>
            ) : (
              filtered.map(name => {
                const checked = selected.includes(name)
                return (
                  <li key={name}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggle(name)}
                      className={cx('filter-chip-option', checked && 'filter-chip-option--checked')}
                    >
                      <span className={cx('filter-chip-check', checked && 'filter-chip-check--on')}>
                        {checked ? <Check size={9} strokeWidth={3} /> : null}
                      </span>
                      <span className="truncate">{formatOption(name)}</span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/** Reset to all operators when the route operator list changes. */
export function useOperatorSelection(routeOperators: string[]) {
  const [selected, setSelected] = useState<string[]>(routeOperators)
  const routeKey = routeOperators.join('\0')

  useEffect(() => {
    setSelected(routeOperators)
  }, [routeKey, routeOperators])

  return { selected, setSelected, allSelected: selected.length === routeOperators.length }
}
