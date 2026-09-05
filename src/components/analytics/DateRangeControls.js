'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { CalendarIcon, X } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

export function DateRangeControls({ preset, from, to }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [hoveredDate, setHoveredDate] = useState(null)
  const isMobile = useIsMobile()

  const [internalRange, setInternalRange] = useState(() => ({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  }))

  const handleOpenChange = (open) => {
    if (open) {
      setInternalRange({
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      })
    }
    setIsPickerOpen(open)
  }

  const apply = (next) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.preset === 'custom' && next.from) {
      params.set('range', 'custom')
      params.set('from', next.from)
      if (next.to) params.set('to', next.to)
      else params.delete('to')
    } else {
      params.set('range', next.preset)
      params.delete('from')
      params.delete('to')
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const applyRange = (range) => {
    if (!range?.from || !range?.to) return
    apply({
      preset: 'custom',
      from: format(range.from, 'yyyy-MM-dd'),
      to: format(range.to, 'yyyy-MM-dd'),
    })
    setIsPickerOpen(false)
  }

  const handleSelect = (range, selectedDay) => {
    if (!selectedDay) return

    if (!internalRange?.from || (internalRange?.from && internalRange?.to)) {
      setInternalRange({ from: selectedDay, to: undefined })
      return
    }

    let newFrom = internalRange.from
    let newTo = selectedDay
    if (newTo < newFrom) {
      newFrom = selectedDay
      newTo = internalRange.from
    }

    const newRange = { from: newFrom, to: newTo }
    setInternalRange(newRange)
    applyRange(newRange)
  }

  const customLabel =
    preset === 'custom' && from && to
      ? `${format(new Date(from), 'MMM d')} – ${format(new Date(to), 'MMM d')}`
      : 'Custom'

  const pillBase =
    'h-9 px-4 rounded-full text-sm font-semibold transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60'
  const pillActive = 'bg-primary text-primary-foreground border border-primary'
  const pillIdle = 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'

  return (
    <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter by date range">
      {[
        { id: '7d', label: '7D', fullLabel: '7 Days' },
        { id: 'all', label: 'All', fullLabel: 'All Time' },
      ].map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={isPending}
          onClick={() => apply({ preset: opt.id })}
          aria-pressed={preset === opt.id}
          className={cn(pillBase, preset === opt.id ? pillActive : pillIdle)}
        >
          <span className="md:hidden">{opt.label}</span>
          <span className="hidden md:inline">{opt.fullLabel}</span>
        </button>
      ))}

      <Popover open={isPickerOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-pressed={preset === 'custom'}
            className={cn(pillBase, preset === 'custom' ? pillActive : pillIdle)}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span className="truncate max-w-[140px]">{customLabel}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 max-w-[100vw] rounded-md border border-slate-200 shadow-md overflow-hidden"
          align={isMobile ? 'center' : 'end'}
          sideOffset={6}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/80">
            <div className="text-sm">
              <p className="font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-0.5">Range</p>
              <p className="font-semibold text-slate-900">
                {internalRange?.from ? (
                  internalRange.to ? (
                    <>
                      {format(internalRange.from, 'MMM d, yyyy')} –{' '}
                      {format(internalRange.to, 'MMM d, yyyy')}
                    </>
                  ) : (
                    <>
                      {format(internalRange.from, 'MMM d, yyyy')} –{' '}
                      <span className="text-slate-400">end…</span>
                    </>
                  )
                ) : (
                  <span className="text-slate-400">Tap a start date</span>
                )}
              </p>
            </div>
            {internalRange?.from ? (
              <button
                type="button"
                onClick={() => setInternalRange({ from: undefined, to: undefined })}
                className="p-1.5 rounded hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Reset selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={internalRange?.from}
            selected={internalRange}
            onSelect={handleSelect}
            onDayMouseEnter={(day) => setHoveredDate(day)}
            onDayMouseLeave={() => setHoveredDate(null)}
            numberOfMonths={isMobile ? 1 : 2}
            disabled={(date) => date > new Date()}
            className="rounded-none border-none p-3 w-full md:[--cell-size:--spacing(10)]"
            modifiers={{
              hoverRange: (date) => {
                if (!internalRange?.from || internalRange?.to || !hoveredDate) return false
                const min = internalRange.from < hoveredDate ? internalRange.from : hoveredDate
                const max = internalRange.from > hoveredDate ? internalRange.from : hoveredDate
                return date > min && date < max
              },
              hoverRangeEnd: (date) => {
                if (!internalRange?.from || internalRange?.to || !hoveredDate) return false
                return date.getTime() === hoveredDate.getTime() && hoveredDate > internalRange.from
              },
              hoverRangeStart: (date) => {
                if (!internalRange?.from || internalRange?.to || !hoveredDate) return false
                return date.getTime() === hoveredDate.getTime() && hoveredDate < internalRange.from
              },
              fromDateHover: (date) => {
                if (!internalRange?.from || internalRange?.to || !hoveredDate) return false
                return (
                  date.getTime() === internalRange.from.getTime() &&
                  hoveredDate.getTime() !== internalRange.from.getTime()
                )
              },
            }}
            modifiersClassNames={{
              hoverRange: 'bg-primary/10 text-primary !rounded-none',
              hoverRangeStart: 'bg-primary/10 text-primary !rounded-l-md !rounded-r-none',
              hoverRangeEnd: 'bg-primary/10 text-primary !rounded-r-md !rounded-l-none',
              fromDateHover:
                internalRange?.from < hoveredDate
                  ? '!rounded-l-md !rounded-r-none'
                  : '!rounded-r-md !rounded-l-none',
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
