'use client'

import { useEffect, useState } from 'react'
import { endOfDay, format, isSameDay, startOfDay, subDays } from 'date-fns'
import { cn } from '@/lib/utils'

const ALERT_PARAM_FORMAT = "yyyy-MM-dd'T'HH:mm:ssXXX"

export function todayAlertRange(now = new Date()) {
  return { from: startOfDay(now), to: endOfDay(now) }
}

export function last7DaysAlertRange(now = new Date()) {
  return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) }
}

function sameCalendarDay(value, date) {
  if (!value || !date) return false
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  return isSameDay(parsed, date)
}

export function isAlertRangeActive(filters, range) {
  return sameCalendarDay(filters?.alert_from, range.from) && sameCalendarDay(filters?.alert_to, range.to)
}

function clearAlertRange(updateQueryParams) {
  updateQueryParams({
    alert_from: null,
    alert_to: null,
    processed_from: null,
    processed_to: null,
    page: 1,
  })
}

function applyAlertRange(updateQueryParams, range) {
  updateQueryParams({
    alert_from: format(range.from, ALERT_PARAM_FORMAT),
    alert_to: format(range.to, ALERT_PARAM_FORMAT),
    processed_from: null,
    processed_to: null,
    page: 1,
  })
}

function buildSuggestions(initialFilters, handleFilterChange, updateQueryParams) {
  const today = todayAlertRange()
  const last7 = last7DaysAlertRange()
  const todayActive = isAlertRangeActive(initialFilters, today)
  const last7Active = isAlertRangeActive(initialFilters, last7)
  const needsReview = initialFilters.client_status === 'To Be Reviewed'
  const highRisk = initialFilters.risk_priority === 'high'
  const stillOnline = initialFilters.visibility_status === 'active'

  return [
    {
      id: 'today',
      label: 'Today',
      active: todayActive,
      onClick: () => (todayActive ? clearAlertRange(updateQueryParams) : applyAlertRange(updateQueryParams, today)),
    },
    {
      id: 'last-7',
      label: 'Last 7 days',
      active: last7Active,
      onClick: () => (last7Active ? clearAlertRange(updateQueryParams) : applyAlertRange(updateQueryParams, last7)),
    },
    {
      id: 'needs-review',
      label: 'Needs review',
      active: needsReview,
      onClick: () => handleFilterChange('client_status', needsReview ? 'all' : 'To Be Reviewed'),
    },
    {
      id: 'high-risk',
      label: 'High risk',
      active: highRisk,
      onClick: () => handleFilterChange('risk_priority', highRisk ? 'all' : 'high'),
    },
    {
      id: 'still-online',
      label: 'Still online',
      active: stillOnline,
      onClick: () => handleFilterChange('visibility_status', stillOnline ? 'all' : 'active'),
    },
  ]
}

export function CaseFilterSuggestions({
  initialFilters,
  handleFilterChange,
  updateQueryParams,
  className,
  scroll = false,
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const suggestions = buildSuggestions(initialFilters, handleFilterChange, updateQueryParams).map((chip) => (
    chip.id === 'today' || chip.id === 'last-7'
      ? { ...chip, active: mounted && chip.active }
      : chip
  ))

  return (
    <div
      className={cn(
        'flex items-center gap-1.5',
        scroll ? 'overflow-x-auto' : 'flex-wrap',
        className,
      )}
    >
      {suggestions.map((chip) => (
        <button
          key={chip.id}
          type="button"
          aria-pressed={chip.active}
          onClick={chip.onClick}
          className={cn(
            'h-7 px-2.5 rounded-full border text-[11px] font-semibold shrink-0 transition-colors cursor-pointer',
            chip.active
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800',
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
