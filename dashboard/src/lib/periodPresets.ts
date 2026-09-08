import { MARKETPLACE_DATA_START } from './marketplaceConstants'
import { MARKETPLACE_SYNC_SLOTS, lastCompletedSlot, nextSyncSlot } from './syncSchedules'
import { SRP_SLOT_KEYS, type SrpSlotKey } from './srpAnalytics'

/** Marketplace / Redbus period presets (travel-date oriented). */
export type PeriodPreset = 'today' | 'tomorrow' | 'yesterday' | 'last7days' | 'mtd' | 'custom'

export interface PeriodRange {
  preset: PeriodPreset
  startDate: string
  endDate: string
  label: string
  completedSlotsToday: SrpSlotKey[]
  /** True when period extends before tracking start or has no observations */
  partialData: boolean
  emptyReason?: string
}

export function istParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

export function isoFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function todayIso(now = new Date()) {
  const { year, month, day } = istParts(now)
  return isoFromParts(year, month, day)
}

export function addDaysIso(iso: string, delta: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

export function clampIsoToDataStart(iso: string) {
  return iso < MARKETPLACE_DATA_START ? MARKETPLACE_DATA_START : iso
}

export function latestAvailableDate(now = new Date()) {
  // Scrapes target the next travel day; allow selecting through tomorrow.
  return addDaysIso(todayIso(now), 1)
}

export function isDateSelectable(iso: string, now = new Date()) {
  return iso >= MARKETPLACE_DATA_START
}

export function completedSnapshotSlotsForDate(dateIso: string, now = new Date()): SrpSlotKey[] {
  const today = todayIso(now)
  if (dateIso !== today) return [...SRP_SLOT_KEYS]
  const last = lastCompletedSlot(MARKETPLACE_SYNC_SLOTS, now)
  if (!last) return []
  const lastIdx = MARKETPLACE_SYNC_SLOTS.findIndex(s => s.label === last.label)
  return SRP_SLOT_KEYS.slice(0, lastIdx + 1)
}

export function formatPeriodDisplay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[m - 1] ?? m} ${y}`
}

export function periodPresetLabel(preset: PeriodPreset): string {
  const labels: Record<PeriodPreset, string> = {
    today: 'Today',
    tomorrow: 'Tomorrow',
    yesterday: 'Yesterday',
    last7days: 'Last 7 days',
    mtd: 'Month to date',
    custom: 'Custom',
  }
  return labels[preset]
}

export function resolvePeriodRange(
  preset: PeriodPreset,
  customStart: string,
  customEnd: string,
  now = new Date(),
): PeriodRange {
  const { year, month, day } = istParts(now)
  const today = isoFromParts(year, month, day)
  const yesterday = addDaysIso(today, -1)
  const tomorrow = addDaysIso(today, 1)
  const latest = latestAvailableDate(now)

  if (preset === 'today') {
    return {
      preset,
      startDate: today,
      endDate: today,
      label: 'Today',
      completedSlotsToday: completedSnapshotSlotsForDate(today, now),
      partialData: false,
    }
  }

  if (preset === 'tomorrow') {
    return {
      preset,
      startDate: tomorrow,
      endDate: tomorrow,
      label: 'Tomorrow',
      completedSlotsToday: [...SRP_SLOT_KEYS],
      partialData: false,
    }
  }

  if (preset === 'yesterday') {
    const beforeTracking = yesterday < MARKETPLACE_DATA_START
    return {
      preset,
      startDate: yesterday,
      endDate: yesterday,
      label: 'Yesterday',
      completedSlotsToday: beforeTracking ? [] : [...SRP_SLOT_KEYS],
      partialData: beforeTracking,
      emptyReason: beforeTracking
        ? 'No data available. Marketplace tracking started on 08 Sep 2026.'
        : undefined,
    }
  }

  if (preset === 'last7days') {
    const rawStart = addDaysIso(latest, -6)
    const startDate = clampIsoToDataStart(rawStart)
    return {
      preset,
      startDate,
      endDate: latest,
      label: `Last 7 days (${formatPeriodDisplay(startDate)} – ${formatPeriodDisplay(latest)})`,
      completedSlotsToday: completedSnapshotSlotsForDate(today, now),
      partialData: rawStart < MARKETPLACE_DATA_START,
    }
  }

  if (preset === 'mtd') {
    const rawStart = isoFromParts(year, month, 1)
    const startDate = clampIsoToDataStart(rawStart)
    return {
      preset,
      startDate,
      endDate: latest,
      label: `Month to date (${formatPeriodDisplay(startDate)} – ${formatPeriodDisplay(latest)})`,
      completedSlotsToday: completedSnapshotSlotsForDate(today, now),
      partialData: rawStart < MARKETPLACE_DATA_START,
    }
  }

  let start = clampIsoToDataStart(customStart || latest)
  let end = customEnd || latest
  if (end > latest) end = latest
  if (start > end) [start, end] = [end, start]
  return {
    preset,
    startDate: start,
    endDate: end,
    label: `Custom (${formatPeriodDisplay(start)} – ${formatPeriodDisplay(end)})`,
    completedSlotsToday: completedSnapshotSlotsForDate(today, now),
    partialData: false,
  }
}

export function datesForPeriod(range: PeriodRange, maxDays = 31): string[] {
  if (range.emptyReason) return []
  const dates: string[] = []
  const start = new Date(`${range.startDate}T12:00:00`)
  const end = new Date(`${range.endDate}T12:00:00`)
  const current = new Date(start)
  let safety = 0
  while (current <= end && safety < maxDays) {
    const iso = current.toISOString().slice(0, 10)
    if (iso >= MARKETPLACE_DATA_START) dates.push(iso)
    current.setDate(current.getDate() + 1)
    safety++
  }
  return dates
}

export function syncStatusLine(now = new Date()) {
  const last = lastCompletedSlot(MARKETPLACE_SYNC_SLOTS, now)
  const next = nextSyncSlot(MARKETPLACE_SYNC_SLOTS, now)
  const { year, month, day } = istParts(now)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const dateLabel = `${day} ${months[month - 1]} ${year}`
  return {
    status: 'current' as const,
    lastScraped: last?.label.replace(' IST', '') ?? '—',
    latestSnapshot: last ? `${dateLabel} · ${last.label.replace(' IST', '')} IST` : '—',
    nextExpected: next.label.replace(' IST', ''),
    dataAvailableFrom: formatPeriodDisplay(MARKETPLACE_DATA_START),
  }
}

/** Map legacy preset names for backward compatibility */
export function normalizePeriodPreset(p: string): PeriodPreset {
  if (p === 'weekly') return 'last7days'
  if (p === 'monthly') return 'mtd'
  if (p === 'today' || p === 'tomorrow' || p === 'yesterday' || p === 'last7days' || p === 'mtd' || p === 'custom') {
    return p
  }
  return 'tomorrow'
}

/** Previous comparable period for comparison KPIs */
export function resolveComparisonRange(range: PeriodRange): PeriodRange | null {
  if (range.emptyReason) return null

  const spanDays =
    Math.round(
      (new Date(`${range.endDate}T12:00:00`).getTime() - new Date(`${range.startDate}T12:00:00`).getTime()) /
        86400000,
    ) + 1

  if (range.preset === 'today') {
    const prev = addDaysIso(range.startDate, -1)
    if (prev < MARKETPLACE_DATA_START) return null
    return {
      preset: 'yesterday',
      startDate: prev,
      endDate: prev,
      label: 'Previous day',
      completedSlotsToday: [...SRP_SLOT_KEYS],
      partialData: false,
    }
  }

  if (range.preset === 'tomorrow') {
    const prev = addDaysIso(range.startDate, -1) // today
    return {
      preset: 'today',
      startDate: prev,
      endDate: prev,
      label: 'Previous day',
      completedSlotsToday: completedSnapshotSlotsForDate(prev),
      partialData: false,
    }
  }

  if (range.preset === 'yesterday') {
    const prev = addDaysIso(range.startDate, -1)
    if (prev < MARKETPLACE_DATA_START) return null
    return {
      preset: 'custom',
      startDate: prev,
      endDate: prev,
      label: 'Previous comparable day',
      completedSlotsToday: [...SRP_SLOT_KEYS],
      partialData: false,
    }
  }

  if (range.preset === 'last7days' || range.preset === 'custom') {
    const prevEnd = addDaysIso(range.startDate, -1)
    const prevStart = addDaysIso(prevEnd, -(spanDays - 1))
    if (prevEnd < MARKETPLACE_DATA_START) return null
    const startDate = clampIsoToDataStart(prevStart)
    return {
      preset: 'custom',
      startDate,
      endDate: prevEnd,
      label: `Previous ${spanDays}-day period`,
      completedSlotsToday: [...SRP_SLOT_KEYS],
      partialData: prevStart < MARKETPLACE_DATA_START,
    }
  }

  if (range.preset === 'mtd') {
    const { year, month } = istParts(new Date(`${range.endDate}T12:00:00`))
    const dayOfMonth = Number(range.endDate.split('-')[2])
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevStart = isoFromParts(prevYear, prevMonth, 1)
    const prevEnd = isoFromParts(prevYear, prevMonth, dayOfMonth)
    if (prevEnd < MARKETPLACE_DATA_START) return null
    return {
      preset: 'custom',
      startDate: clampIsoToDataStart(prevStart),
      endDate: prevEnd,
      label: 'Previous month (equivalent days)',
      completedSlotsToday: [...SRP_SLOT_KEYS],
      partialData: prevStart < MARKETPLACE_DATA_START,
    }
  }

  return null
}

export function comparisonUnavailableMessage() {
  return 'Comparison unavailable — historical tracking began on 08 Sep 2026.'
}
