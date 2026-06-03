'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { CalendarIcon, Clock2Icon, ChevronDown } from 'lucide-react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-media-query'

const halfHourOptions = Array.from({ length: 48 }).map((_, i) => {
  const totalMinutes = i * 30
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
})

const get24HourString = (date) => {
  if (!date) return '00:00'
  return format(new Date(date), 'HH:mm')
}

function CustomTimePicker({ date, onChange, disabled, useNativeSelect }) {
  const [open, setOpen] = useState(false)
  const time24 = get24HourString(date)

  const updateDate = (newTime24) => {
    if (!date) return
    const [h, m] = newTime24.split(':').map(Number)
    const updated = new Date(date)
    updated.setHours(h, m, 0, 0)
    onChange(updated)
    setOpen(false)
  }

  if (useNativeSelect) {
    return (
      <select
        value={date ? time24 : ''}
        disabled={disabled}
        onChange={(e) => updateDate(e.target.value)}
        className={cn(
          'w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900',
          'focus:outline-none focus:ring-1 focus:ring-blue-500',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {!date && <option value="">Select time</option>}
        {halfHourOptions.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    )
  }

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn(
            'w-full justify-between bg-transparent border-slate-200 font-normal h-9',
            !date && 'text-muted-foreground'
          )}
        >
          <div className="flex items-center gap-2">
            <Clock2Icon className="h-4 w-4 opacity-50" />
            {date ? time24 : 'Select time'}
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 flex h-[200px] z-[110]" align="start">
        <div className="flex flex-col w-32 overflow-y-auto p-1 custom-scrollbar overscroll-contain">
          {halfHourOptions.map((t) => (
            <Button
              key={t}
              variant="ghost"
              className={cn(
                'justify-center font-normal px-2 py-1 h-8 shrink-0',
                time24 === t
                  ? 'bg-blue-600 text-white hover:!bg-blue-700 hover:!text-white'
                  : 'hover:bg-slate-100 hover:text-slate-900'
              )}
              onClick={() => updateDate(t)}
            >
              {t}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

const MOBILE_CALENDAR_CLASS =
  'rounded-md border-none p-1 w-fit mx-auto shrink-0 [--cell-size:2rem] [&_[data-slot=calendar]]:mx-auto'

const MOBILE_CALENDAR_CLASSNAMES = {
  month: 'flex w-full flex-col gap-2',
  week: 'mt-1 flex w-full',
  weekdays: 'flex',
  weekday: 'flex-1 text-[0.7rem] font-normal text-muted-foreground select-none',
}

function DateFilterPickerBody({
  title,
  dateRange,
  setDateRange,
  onDateSelect,
  onClear,
  onApply,
  useNativeSelect,
  stacked,
  mobileDialog = false,
}) {
  const summaryBlock = (
    <div className="flex flex-col gap-0.5 text-[10px] min-w-0">
      <div className="flex items-center justify-end gap-2">
        <span className="font-medium text-slate-400 uppercase tracking-wide shrink-0">From</span>
        <span className="text-slate-900 font-semibold truncate">
          {dateRange?.from ? format(dateRange.from, stacked ? 'do MMM yyyy - HH:mm' : 'dd MMM, HH:mm') : '—'}
        </span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="font-medium text-slate-400 uppercase tracking-wide shrink-0">To</span>
        <span className="text-slate-900 font-semibold truncate">
          {dateRange?.to ? format(dateRange.to, stacked ? 'do MMM yyyy - HH:mm' : 'dd MMM, HH:mm') : '—'}
        </span>
      </div>
    </div>
  )

  const timeAndActions = (
    <div className={cn('flex flex-col gap-2', !stacked && 'min-w-[148px]')}>
      <FieldGroup className="gap-2">
        <Field className="gap-1">
          <FieldLabel className="text-[10px] uppercase font-bold text-slate-400">
            From Time
          </FieldLabel>
          <CustomTimePicker
            date={dateRange.from}
            disabled={!dateRange.from}
            useNativeSelect={useNativeSelect}
            onChange={(d) => setDateRange((prev) => ({ ...prev, from: d }))}
          />
        </Field>
        <Field className="gap-1">
          <FieldLabel className="text-[10px] uppercase font-bold text-slate-400">
            To Time
          </FieldLabel>
          <CustomTimePicker
            date={dateRange.to}
            disabled={!dateRange.to}
            useNativeSelect={useNativeSelect}
            onChange={(d) => setDateRange((prev) => ({ ...prev, to: d }))}
          />
        </Field>
      </FieldGroup>
      <div className="flex flex-col gap-1.5 pt-0.5">
        <Button
          variant="ghost"
          className="w-full text-xs h-8 text-slate-500 hover:text-slate-900"
          onClick={onClear}
        >
          Clear
        </Button>
        <Button
          className="w-full text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white"
          onClick={onApply}
        >
          Apply Filter
        </Button>
      </div>
    </div>
  )

  const calendar = (
    <Calendar
      mode="range"
      defaultMonth={dateRange?.from}
      numberOfMonths={1}
      selected={dateRange}
      onSelect={onDateSelect}
      disabled={{ after: new Date() }}
      className={
        stacked
          ? MOBILE_CALENDAR_CLASS
          : 'rounded-md border-none p-0 shrink-0 [--cell-size:2rem]'
      }
      classNames={stacked ? MOBILE_CALENDAR_CLASSNAMES : undefined}
    />
  )

  if (mobileDialog) {
    return (
      <Card className="flex flex-col h-full min-h-0 w-full max-w-full shadow-none border-0 gap-0 py-0">
        <CardHeader className="border-b bg-slate-50/50 shrink-0 m-0 gap-2 px-3 py-2 !pb-2 pr-12 flex flex-col">
          <div className="min-w-0 shrink-0">
            <span className="text-[10px] text-slate-500 leading-none">Filter by</span>
            <p className="font-semibold text-sm text-slate-900 leading-tight mt-0.5">{title}</p>
          </div>
          <div className="min-w-0 w-full">{summaryBlock}</div>
        </CardHeader>

        <div className="shrink-0 flex justify-center items-center px-3 py-3 min-h-[17.5rem] bg-white">
          {calendar}
        </div>

        <CardContent className="shrink-0 m-0 px-3 pt-3 pb-4 border-t border-slate-100">
          {timeAndActions}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-full shadow-none border-0 gap-0 py-0">
      <CardHeader
        className={cn(
          'border-b bg-slate-50/50 shrink-0 m-0 gap-2 px-3 py-2 !pb-2 grid-rows-1 auto-rows-auto',
          stacked ? 'flex flex-col' : 'flex flex-row items-center justify-between'
        )}
      >
        <div className="min-w-0 shrink-0">
          <span className="text-[10px] text-slate-500 leading-none">Filter by</span>
          <p className="font-semibold text-sm text-slate-900 leading-tight mt-0.5">{title}</p>
        </div>
        <div className={cn('min-w-0', stacked && 'w-full')}>{summaryBlock}</div>
      </CardHeader>

      <CardContent className="m-0 p-2 px-2">
        {stacked ? (
          <div className="flex flex-col gap-3">
            <div className="flex justify-center w-full py-1">{calendar}</div>
            <div className="border-t border-slate-100 pt-3">{timeAndActions}</div>
          </div>
        ) : (
          <div className="flex flex-row gap-2 items-start">
            {calendar}
            <div className="border-l border-slate-100 pl-2 shrink-0">{timeAndActions}</div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function DateFilterPopover({
  title,
  onApply,
  initialFrom,
  initialTo,
  applyWhenRangeComplete = false,
  triggerClassName,
}) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [dateRange, setDateRange] = useState({
    from: initialFrom ? new Date(initialFrom) : undefined,
    to: initialTo ? new Date(initialTo) : undefined,
  })
  const [appliedRange, setAppliedRange] = useState({
    from: initialFrom ? new Date(initialFrom) : undefined,
    to: initialTo ? new Date(initialTo) : undefined,
  })

  useEffect(() => {
    setDateRange({
      from: initialFrom ? new Date(initialFrom) : undefined,
      to: initialTo ? new Date(initialTo) : undefined,
    })
    setAppliedRange({
      from: initialFrom ? new Date(initialFrom) : undefined,
      to: initialTo ? new Date(initialTo) : undefined,
    })
  }, [initialFrom, initialTo])

  const handleOpenChange = (newOpen) => {
    if (!newOpen) {
      setDateRange({ ...appliedRange })
    }
    setOpen(newOpen)
  }

  const handleApply = () => {
    if (!dateRange.from || !dateRange.to) {
      setDateRange({ from: undefined, to: undefined })
      setAppliedRange({ from: undefined, to: undefined })
      onApply({ from: null, to: null })
    } else {
      setAppliedRange({ ...dateRange })
      onApply(dateRange)
    }
    setOpen(false)
  }

  const handleClear = () => {
    setDateRange({ from: undefined, to: undefined })
    setAppliedRange({ from: undefined, to: undefined })
    onApply({ from: null, to: null })
    setOpen(false)
  }

  const handleDateSelect = (newRange, selectedDay) => {
    if (!selectedDay) return

    if (!dateRange?.from || (dateRange?.from && dateRange?.to)) {
      const newFrom = new Date(selectedDay)
      if (dateRange?.from) {
        newFrom.setHours(dateRange.from.getHours(), dateRange.from.getMinutes(), 0, 0)
      } else {
        newFrom.setHours(0, 0, 0, 0)
      }
      setDateRange({ from: newFrom, to: undefined })
      return
    }

    let rawFrom = dateRange.from
    let rawTo = selectedDay

    const dayFrom = new Date(rawFrom).setHours(0, 0, 0, 0)
    const dayTo = new Date(rawTo).setHours(0, 0, 0, 0)

    if (dayTo < dayFrom) {
      rawTo = dateRange.from
      rawFrom = selectedDay
    }

    const updatedRange = {
      from: new Date(rawFrom),
      to: new Date(rawTo),
    }

    if (updatedRange.from) {
      if (dateRange?.from && rawFrom === dateRange.from) {
        updatedRange.from.setHours(dateRange.from.getHours(), dateRange.from.getMinutes(), 0, 0)
      } else {
        updatedRange.from.setHours(0, 0, 0, 0)
      }
    }

    if (updatedRange.to) {
      if (dateRange?.to && rawTo === dateRange.to) {
        updatedRange.to.setHours(dateRange.to.getHours(), dateRange.to.getMinutes(), 0, 0)
      } else {
        updatedRange.to.setHours(23, 30, 0, 0)
      }
    }

    setDateRange(updatedRange)

    if (applyWhenRangeComplete && updatedRange.from && updatedRange.to) {
      setAppliedRange({ ...updatedRange })
      onApply(updatedRange)
      setOpen(false)
    }
  }

  const triggerButton = (
    <Button
      variant="outline"
      className={cn(
        'w-full justify-start text-left font-normal bg-white border-slate-200 h-9 text-xs shadow-none hover:bg-slate-50',
        triggerClassName
      )}
    >
      <CalendarIcon className="h-3.5 w-3.5 mr-2 shrink-0 text-slate-400" />
      {appliedRange?.from ? (
        appliedRange.to ? (
          <span className="truncate text-slate-900">
            {format(appliedRange.from, 'LLL dd')} - {format(appliedRange.to, 'LLL dd')}
          </span>
        ) : (
          <span className="truncate text-slate-900">{format(appliedRange.from, 'LLL dd, y')}</span>
        )
      ) : (
        <span className="text-slate-500 truncate">{title}</span>
      )}
    </Button>
  )

  const pickerProps = {
    title,
    dateRange,
    setDateRange,
    onDateSelect: handleDateSelect,
    onClear: handleClear,
    onApply: handleApply,
    useNativeSelect: isMobile,
    stacked: isMobile,
  }

  if (isMobile) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          className={cn(
            'w-full justify-start text-left font-normal bg-white border-slate-200 h-9 text-xs shadow-none hover:bg-slate-50',
            triggerClassName
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 mr-2 shrink-0 text-slate-400" />
          {appliedRange?.from ? (
            appliedRange.to ? (
              <span className="truncate text-slate-900">
                {format(appliedRange.from, 'LLL dd')} - {format(appliedRange.to, 'LLL dd')}
              </span>
            ) : (
              <span className="truncate text-slate-900">{format(appliedRange.from, 'LLL dd, y')}</span>
            )
          ) : (
            <span className="text-slate-500 truncate">{title}</span>
          )}
        </Button>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent
            showCloseButton
            overlayClassName="z-[100]"
            className={cn(
              'z-[100] w-[calc(100vw-1rem)] max-w-sm p-0 gap-0',
              'max-h-[min(92dvh,680px)] flex flex-col overflow-y-auto overscroll-contain',
              '[&>button]:absolute [&>button]:top-3 [&>button]:right-3 [&>button]:z-20',
              '[&>button]:size-9 [&>button]:rounded-full [&>button]:opacity-100',
              '[&>button]:bg-white [&>button]:border [&>button]:border-slate-200',
              '[&>button]:shadow-sm [&>button]:flex [&>button]:items-center [&>button]:justify-center',
              '[&>button]:hover:bg-slate-50 [&>button]:focus:ring-2 [&>button]:focus:ring-blue-500/30'
            )}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <DateFilterPickerBody {...pickerProps} mobileDialog />
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent
        className={cn(
          'z-[60] w-auto max-w-[min(calc(100vw-1.5rem),520px)] p-0',
          'max-h-[min(85vh,var(--radix-popover-content-available-height,85vh))]',
          'overflow-y-auto overscroll-contain custom-scrollbar'
        )}
        align="start"
        side="bottom"
        collisionPadding={12}
        avoidCollisions
      >
        <DateFilterPickerBody {...pickerProps} />
      </PopoverContent>
    </Popover>
  )
}
