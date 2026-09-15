import type { RedbusSrpEntry } from '../api'
import { EXPERIENCE_KPIS } from './experienceKpiAnalytics'

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function tagCount(row: RedbusSrpEntry, tagName: string): string {
  if (!Array.isArray(row.tags)) return ''
  const want = tagName.trim().toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ')
  const match = row.tags.find((t: { tagmsg?: string; label?: string; name?: string; tagName?: string }) => {
    const name = t.tagmsg || t.label || t.name || t.tagName || ''
    const n = String(name).trim().toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ')
    return n === want
  })
  if (!match) return ''
  const raw =
    (match as { NoOfUsers?: number }).NoOfUsers ??
    (match as { noOfUsers?: number }).noOfUsers ??
    (match as { count?: number }).count
  const cnt = Number(raw)
  return Number.isFinite(cnt) ? String(cnt) : ''
}

function srpRank(row: RedbusSrpEntry): string {
  const slots = Object.values(row.snapshots || {})
  if (!slots.length) return ''
  return String(Math.round(slots.reduce((a, b) => a + Number(b), 0) / slots.length))
}

const HEADERS = [
  'Route',
  'Operator',
  'Timing',
  'Duration',
  'Bus Type',
  'SRP Rank',
  'Rating',
  'Total No. of Ratings',
  'Price',
  ...EXPERIENCE_KPIS.map(k => k.label),
]

function rowValues(row: RedbusSrpEntry): string[] {
  return [
    row.route || '',
    row.operator || '',
    row.timing || '',
    row.duration || '',
    row.bus_type || '',
    srpRank(row),
    row.rating && row.rating !== '0' ? row.rating : '',
    row.reviews ? String(row.reviews).replace(/[^\d]/g, '') : '',
    row.price || '',
    ...EXPERIENCE_KPIS.map(k => {
      for (const tag of k.listingTags) {
        const v = tagCount(row, tag)
        if (v) return v
      }
      return ''
    }),
  ]
}

export function formatListingDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${m[3]}-${m[2]}-${m[1].slice(2)}`
}

export function listingExportBasename(startDate: string, endDate: string): string {
  return `All Service listings_${formatListingDate(startDate)} - ${formatListingDate(endDate)}`
}

function triggerDownload(filename: string, mime: string, contents: string) {
  const blob = new Blob([contents], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadListingsCsv(rows: RedbusSrpEntry[], startDate: string, endDate: string) {
  const lines = [HEADERS.map(csvEscape).join(','), ...rows.map(r => rowValues(r).map(csvEscape).join(','))]
  triggerDownload(`${listingExportBasename(startDate, endDate)}.csv`, 'text/csv;charset=utf-8', `\uFEFF${lines.join('\n')}`)
}

export function downloadListingsExcel(rows: RedbusSrpEntry[], startDate: string, endDate: string) {
  // Generate a proper CSV that Excel opens natively — no XML/SpreadsheetML needed
  const lines = [
    HEADERS.map(csvEscape).join(','),
    ...rows.map(r => rowValues(r).map(csvEscape).join(',')),
  ]
  // Use .xlsx extension with CSV content — Excel opens this correctly
  triggerDownload(
    `${listingExportBasename(startDate, endDate)}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    `\uFEFF${lines.join('\n')}`,
  )
}
