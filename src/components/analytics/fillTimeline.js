import { format, eachDayOfInterval, parseISO } from 'date-fns'

export function fillTimeline(timeline, fromIso, toIso) {
  const byDay = new Map((timeline || []).map((r) => [r.date, r.count]))
  if (!fromIso || !toIso) {
    return (timeline || []).map((r) => ({
      date: r.date,
      label: format(parseISO(r.date), 'MMM d'),
      count: r.count,
    }))
  }
  let start
  let end
  try {
    start = parseISO(fromIso.slice(0, 10))
    end = parseISO(toIso.slice(0, 10))
  } catch {
    return []
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return []

  return eachDayOfInterval({ start, end }).map((day) => {
    const key = format(day, 'yyyy-MM-dd')
    return {
      date: key,
      label: format(day, 'MMM d'),
      count: byDay.get(key) || 0,
    }
  })
}
