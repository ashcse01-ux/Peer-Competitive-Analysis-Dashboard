import React from 'react'

interface TooltipPayload {
  name?: string | number
  value?: number | string | null
  color?: string
  dataKey?: string | number
}

interface Props {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string | number
  dataTimestamp?: string | null
}

function formatValue(value: number | string | null | undefined) {
  if (value == null || value === '') return 'No data'
  if (typeof value === 'number') return Math.abs(value) >= 100 ? value.toLocaleString('en-IN') : value.toFixed(2)
  const parsed = Number(value)
  if (Number.isFinite(parsed)) return Math.abs(parsed) >= 100 ? parsed.toLocaleString('en-IN') : parsed.toFixed(2)
  return value
}

export default function ChartTooltip({ active, payload, label, dataTimestamp }: Props) {
  if (!active) return null

  const cleanPayload = (payload ?? []).filter(entry => entry.value != null)

  return (
    <div className="min-w-[180px] rounded-lg border border-white/80 bg-white/90 px-4 py-3 text-sm shadow-2xl shadow-slate-900/10 backdrop-blur-xl pointer-events-none">
      {label != null && (
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      )}
      {cleanPayload.length > 0 ? (
        cleanPayload.map((entry, index) => (
          <div key={`${entry.dataKey ?? entry.name ?? index}`} className="flex items-center justify-between gap-5 py-1">
            <span className="flex min-w-0 items-center gap-2 text-slate-600">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color ?? '#0077b6' }}
              />
              <span className="truncate">{entry.name ?? entry.dataKey}</span>
            </span>
            <span className="shrink-0 font-black text-[#14211f]">{formatValue(entry.value)}</span>
          </div>
        ))
      ) : (
        <p className="text-xs font-semibold text-slate-400">No data available</p>
      )}
      {dataTimestamp && (
        <p className="mt-2 border-t border-slate-900/10 pt-2 text-[0.68rem] font-semibold text-slate-400">
          {new Date(dataTimestamp).toLocaleString()}
        </p>
      )}
    </div>
  )
}
