import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { RedbusSrpEntry } from '../api'
import { useRedbusTags } from '../api'
import {
  LEADERSHIP_COLUMNS,
  LEADERSHIP_DIM_COUNT,
  buildRouteLeadershipMatrix,
  confidenceLabel,
  formatMatrixValue,
  freshbusMedal,
  type DimensionStanding,
  type MatrixColumn,
  type OperatorStanding,
  type RouteLeadershipRow,
} from '../lib/routeLeadershipMatrix'
import { cx } from '../lib/insights'

interface Props {
  rows: RedbusSrpEntry[]
}

interface DetailTarget {
  routeLabel: string
  column: MatrixColumn
  standing: DimensionStanding
}

function servicesNote(n: number): string {
  return n === 1 ? '1 service' : `${n} services`
}

function FreshBusLine({
  fb,
  format,
  showLimitedInline,
}: {
  fb: OperatorStanding
  format: MatrixColumn['format']
  /** When true, append "· N services" on the FreshBus line (keeps cell to 2 lines). */
  showLimitedInline?: boolean
}) {
  const medal = freshbusMedal(fb.displayRank)
  const valueText = formatMatrixValue(format, fb.value)
  const rankPart = fb.displayRank != null ? `#${fb.displayRank}` : ''
  const limited = fb.confidence === 'limited'

  return (
    <span className="fb-lead-line fb-lead-line--fresh">
      {medal ? <span className="fb-lead-medal">{medal}</span> : null}
      <span>
        FreshBus{rankPart ? ` ${rankPart}` : ''} · {valueText}
        {limited && showLimitedInline ? (
          <span className="fb-lead-sample"> · {servicesNote(fb.serviceCount)}</span>
        ) : null}
      </span>
    </span>
  )
}

function PeerLeaderLine({
  leader,
  format,
}: {
  leader: OperatorStanding
  format: MatrixColumn['format']
}) {
  return (
    <span className="fb-lead-line">
      <span>
        {leader.name} #1 · {formatMatrixValue(format, leader.value)}
      </span>
    </span>
  )
}

function SummaryCell({ standing, column }: { standing: DimensionStanding; column: MatrixColumn }) {
  if (!column.competitive) {
    if (standing.supportingValue == null) return <span className="fb-lead-empty">—</span>
    return (
      <div className="fb-lead-cell">
        <span className="fb-lead-line fb-lead-line--fresh">
          {formatMatrixValue(column.format, standing.supportingValue)}
        </span>
      </div>
    )
  }

  const { officialLeader, freshbus, freshbusIsLeader } = standing
  if (!freshbus && !officialLeader) return <span className="fb-lead-empty">—</span>

  // FreshBus is #1 — at most 2 lines; never repeat peer on line 2
  if (freshbus && freshbusIsLeader) {
    return (
      <div className="fb-lead-cell">
        <FreshBusLine fb={freshbus} format={column.format} />
        {freshbus.confidence === 'limited' ? (
          <span className="fb-lead-limited-flag">{servicesNote(freshbus.serviceCount)} · Limited data</span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="fb-lead-cell">
      {officialLeader && !officialLeader.isFreshBus ? (
        <PeerLeaderLine leader={officialLeader} format={column.format} />
      ) : freshbus ? (
        <span className="fb-lead-line fb-lead-muted">No official peer leader</span>
      ) : null}
      {freshbus ? (
        <FreshBusLine fb={freshbus} format={column.format} showLimitedInline={freshbus.confidence === 'limited'} />
      ) : null}
    </div>
  )
}

function TooltipBody({
  routeLabel,
  column,
  standing,
}: {
  routeLabel: string
  column: MatrixColumn
  standing: DimensionStanding
}) {
  const leader = standing.officialLeader
  const fb = standing.freshbus

  return (
    <div className="fb-lead-tip">
      <div className="fb-lead-tip__meta">
        <div>
          <span className="fb-lead-tip__k">Route</span> {routeLabel}
        </div>
        <div>
          <span className="fb-lead-tip__k">KPI</span> {column.label}
        </div>
      </div>

      {fb ? (
        <div className="fb-lead-tip__block fb-lead-tip__block--fresh">
          <div className="fb-lead-tip__title">
            {freshbusMedal(fb.displayRank)} FreshBus
          </div>
          <ul>
            <li>
              Rank: {fb.displayRank != null ? `#${fb.displayRank}` : '—'}
            </li>
            <li>Value: {formatMatrixValue(column.format, fb.value)}</li>
            <li>Services: {fb.serviceCount}</li>
            <li>Confidence: {confidenceLabel(fb.confidence)}</li>
          </ul>
        </div>
      ) : null}

      {leader && !leader.isFreshBus ? (
        <div className="fb-lead-tip__block">
          <div className="fb-lead-tip__title">Official peer leader</div>
          <ul>
            <li>{leader.name}</li>
            <li>Rank: #1</li>
            <li>Value: {formatMatrixValue(column.format, leader.value)}</li>
            <li>Services: {leader.serviceCount}</li>
            <li>Confidence: {confidenceLabel(leader.confidence)}</li>
          </ul>
        </div>
      ) : null}

      <p className="fb-lead-tip__note">Official ranking considers operators with 3+ services.</p>
      {fb?.confidence === 'limited' ? (
        <p className="fb-lead-tip__note">FreshBus retained as focal company despite limited sample.</p>
      ) : null}
      <p className="fb-lead-tip__hint">Click for full ranking</p>
    </div>
  )
}

function DetailModal({
  target,
  onClose,
}: {
  target: DetailTarget
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const { column, standing, routeLabel } = target

  return (
    <div className="fb-lead-modal" role="presentation" onClick={onClose}>
      <div
        className="fb-lead-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${column.label} ranking — ${routeLabel}`}
        tabIndex={-1}
        ref={panelRef}
        onClick={e => e.stopPropagation()}
      >
        <div className="fb-lead-modal__head">
          <div>
            <h4 className="fb-lead-modal__title">
              {column.label} — {routeLabel}
            </h4>
            <p className="fb-lead-modal__sub">Full operator ranking for this KPI</p>
          </div>
          <button type="button" className="fb-lead-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="fb-lead-modal__scroll">
          <table className="fb-lead-detail-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Operator</th>
                <th>Value</th>
                <th>Services</th>
                <th>Confidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {standing.rankings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="fb-lead-empty">
                    No data available.
                  </td>
                </tr>
              ) : (
                standing.rankings.map(row => {
                  const rankText =
                    row.status === 'Insufficient sample'
                      ? '—'
                      : row.displayRank != null
                        ? String(row.displayRank)
                        : row.officialRank != null
                          ? String(row.officialRank)
                          : '—'
                  const medal = row.isFreshBus ? freshbusMedal(row.displayRank) : ''
                  return (
                    <tr
                      key={`${row.operator}-${row.status}`}
                      className={cx(row.isFreshBus && 'fb-lead-detail-table__fresh')}
                    >
                      <td className="tabular-nums">
                        {medal ? `${medal} ` : ''}
                        {rankText}
                      </td>
                      <td>{row.name}</td>
                      <td className="tabular-nums">{formatMatrixValue(column.format, row.value)}</td>
                      <td className="tabular-nums">{row.serviceCount}</td>
                      <td>{confidenceLabel(row.confidence)}</td>
                      <td>
                        {row.status === 'Focal'
                          ? 'Focal (limited sample)'
                          : row.status}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="fb-lead-modal__foot">
          <span>Official ranking: operators with 3+ services.</span>
          {standing.freshbus?.confidence === 'limited' ? (
            <span>FreshBus retained as focal company despite limited sample.</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function InteractiveKpiCell({
  routeLabel,
  column,
  standing,
  onOpenDetail,
}: {
  routeLabel: string
  column: MatrixColumn
  standing: DimensionStanding
  onOpenDetail: (t: DetailTarget) => void
}) {
  const [hover, setHover] = useState(false)
  const interactive = column.competitive

  if (!interactive) {
    return <SummaryCell standing={standing} column={column} />
  }

  const hasData = Boolean(standing.freshbus || standing.officialLeader)
  if (!hasData) return <span className="fb-lead-empty">—</span>

  return (
    <button
      type="button"
      className={cx('fb-lead-kpi-btn', hover && 'fb-lead-kpi-btn--hover')}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onClick={() => onOpenDetail({ routeLabel, column, standing })}
      aria-label={`${column.label} on ${routeLabel}. Hover for summary, click for full ranking.`}
    >
      <SummaryCell standing={standing} column={column} />
      {hover ? (
        <div className="fb-lead-tip-wrap" role="tooltip">
          <TooltipBody routeLabel={routeLabel} column={column} standing={standing} />
        </div>
      ) : null}
    </button>
  )
}

function LeadershipBadge({ row }: { row: RouteLeadershipRow }) {
  return (
    <span className="fb-lead-score">
      FreshBus {row.freshbusLeadWins}/{LEADERSHIP_DIM_COUNT}
      {row.freshbusLimitedSample ? (
        <span className="fb-lead-score__lim" title="Some KPIs use limited FreshBus sample">
          Limited data
        </span>
      ) : null}
    </span>
  )
}

export default function FreshbusRouteLeadershipMatrix({ rows }: Props) {
  const { data: tagData, isLoading: tagsLoading } = useRedbusTags()
  const [detail, setDetail] = useState<DetailTarget | null>(null)
  const matrix = useMemo(
    () => buildRouteLeadershipMatrix(rows, tagData?.operators ?? []),
    [rows, tagData?.operators],
  )

  if (!rows.length) return null

  return (
    <section className="srp-listings-panel fb-lead-panel">
      <div className="srp-listings-panel__head">
        <div>
          <h3 className="srp-listings-panel__title">FreshBus Route Leadership Matrix</h3>
          <p className="srp-listings-panel__sub">
            Compact peer summary · hover any KPI for context · click for full ranking · Leadership =
            FreshBus #1 count / {LEADERSHIP_DIM_COUNT}
          </p>
        </div>
        <span className="srp-listings-count">
          {tagsLoading ? 'Loading tags… · ' : null}
          <strong>{matrix.length}</strong> route{matrix.length === 1 ? '' : 's'}
        </span>
      </div>

      {!matrix.length ? (
        <div className="p-8 text-center text-theme-muted">No FreshBus services in the selected filters.</div>
      ) : (
        <div className="srp-listings-scroll fb-lead-scroll">
          <table className="data-table fb-lead-table">
            <thead>
              <tr>
                <th className="fb-lead-sticky">Route</th>
                <th>FreshBus Leadership</th>
                {LEADERSHIP_COLUMNS.map(col => (
                  <th key={col.id} className={cx(!col.counted && 'fb-lead-th--support')}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map(row => (
                <tr key={row.routeKey}>
                  <td className="fb-lead-sticky fb-lead-route">{row.routeLabel}</td>
                  <td>
                    <LeadershipBadge row={row} />
                  </td>
                  {LEADERSHIP_COLUMNS.map(col => (
                    <td key={col.id}>
                      <InteractiveKpiCell
                        routeLabel={row.routeLabel}
                        column={col}
                        standing={row.dimensions[col.id]}
                        onOpenDetail={setDetail}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="fb-lead-legend">
        <span>🥇 FreshBus #1</span>
        <span>🥈 FreshBus #2</span>
        <span>🥉 FreshBus #3</span>
        <span>Peers need 3+ services for official #1</span>
        <span>FreshBus always retained (1–2 services = Limited data)</span>
      </div>

      {detail ? <DetailModal target={detail} onClose={() => setDetail(null)} /> : null}
    </section>
  )
}
