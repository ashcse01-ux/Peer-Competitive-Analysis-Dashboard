/** Sync cadence definitions (IST). Backend scrapers will align to these windows. */

export type SyncChannel =
  | 'google_play'
  | 'ios_app_store'
  | 'google_search'
  | 'redbus_marketplace'
  | 'abhibus_marketplace'
  | 'redbus_srp'
  | 'abhibus_srp'

export interface SyncSlot {
  hour: number
  minute: number
  label: string
}

export const APP_STORE_SYNC_SLOTS: SyncSlot[] = [{ hour: 8, minute: 0, label: '08:00 IST' }]

export const MARKETPLACE_SYNC_SLOTS: SyncSlot[] = [
  { hour: 5, minute: 0, label: '05:00 IST' },
  { hour: 11, minute: 0, label: '11:00 IST' },
  { hour: 17, minute: 0, label: '17:00 IST' },
  { hour: 23, minute: 0, label: '23:00 IST' },
]

export const SRP_SYNC_SLOTS = MARKETPLACE_SYNC_SLOTS

export const SYNC_CHANNEL_META: Record<
  SyncChannel,
  { title: string; description: string; slots: SyncSlot[]; oncePerDay: boolean }
> = {
  google_play: {
    title: 'Google Play Store',
    description: 'Live scrape of all 7 operators. Last sync of the IST day overwrites that day’s row.',
    slots: APP_STORE_SYNC_SLOTS,
    oncePerDay: true,
  },
  ios_app_store: {
    title: 'Apple iOS Store',
    description: 'Live scrape of all 7 operators. Last sync of the IST day overwrites that day’s row.',
    slots: APP_STORE_SYNC_SLOTS,
    oncePerDay: true,
  },
  google_search: {
    title: 'Google Search',
    description: 'Live scrape of all 7 operators. Last sync of the IST day overwrites that day’s row.',
    slots: APP_STORE_SYNC_SLOTS,
    oncePerDay: true,
  },
  redbus_marketplace: {
    title: 'Redbus KPIs',
    description: 'Route KPI scrape 4× daily at 05:00, 11:00, 17:00, 23:00 IST.',
    slots: MARKETPLACE_SYNC_SLOTS,
    oncePerDay: false,
  },
  abhibus_marketplace: {
    title: 'Abhibus KPIs',
    description: 'Route KPI scrape 4× daily at 05:00, 11:00, 17:00, 23:00 IST.',
    slots: MARKETPLACE_SYNC_SLOTS,
    oncePerDay: false,
  },
  redbus_srp: {
    title: 'Redbus SRP',
    description: 'Search rank grid refresh every 6 hours — 05:00, 11:00, 17:00, 23:00 IST.',
    slots: SRP_SYNC_SLOTS,
    oncePerDay: false,
  },
  abhibus_srp: {
    title: 'Abhibus SRP',
    description: 'Search rank grid refresh every 6 hours — 05:00, 11:00, 17:00, 23:00 IST.',
    slots: SRP_SYNC_SLOTS,
    oncePerDay: false,
  },
}

function istDateParts(now = new Date()) {
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

export function lastCompletedSlot(slots: SyncSlot[], now = new Date()): SyncSlot | null {
  const { hour, minute } = istDateParts(now)
  const current = hour * 60 + minute
  let last: SyncSlot | null = null
  for (const slot of slots) {
    const t = slot.hour * 60 + slot.minute
    if (t <= current) last = slot
  }
  return last ?? slots[slots.length - 1] ?? null
}

/** Data shown on dashboard always maps to the latest completed scrape window — not the next one. */
export function activeDataSnapshotSlot(slots: SyncSlot[], now = new Date()): SyncSlot {
  return lastCompletedSlot(slots, now) ?? slots[0]
}

export function snapshotPolicyNote(slots: SyncSlot[], now = new Date()): string {
  const active = activeDataSnapshotSlot(slots, now)
  const times = slots.map(s => s.label.replace(' IST', '')).join(', ')
  return `Showing ${active.label} snapshot. Only 4 stored per day (${times}) — extra sync clicks refresh this view but do not add rows.`
}

export function nextSyncSlot(slots: SyncSlot[], now = new Date()): SyncSlot {
  const { hour, minute } = istDateParts(now)
  const current = hour * 60 + minute
  for (const slot of slots) {
    const t = slot.hour * 60 + slot.minute
    if (t > current) return slot
  }
  return slots[0]
}

export function formatIstNow(now = new Date()) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(now)
}
