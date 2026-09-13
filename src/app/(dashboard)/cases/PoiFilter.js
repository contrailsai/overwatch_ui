'use client'

import { useId, useState, useEffect } from 'react'
import { CheckIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function PoiFilter({ poiOptions = [], initialPois = '', onChange, inline = false, compact = false }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [selectedValues, setSelectedValues] = useState([])

  useEffect(() => {
    const newValues = initialPois && initialPois !== 'all' ? initialPois.split(',').filter(Boolean) : []
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedValues(newValues)
  }, [initialPois])

  const labelFor = (name) => {
    const match = poiOptions.find((poi) => poi.name === name)
    return match?.display_name || name
  }

  const toggleSelection = (value) => {
    const newValues = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value]
    setSelectedValues(newValues)
    onChange(newValues.length > 0 ? newValues.join(',') : null)
  }

  const removeSelection = (value) => {
    const newValues = selectedValues.filter((v) => v !== value)
    setSelectedValues(newValues)
    onChange(newValues.length > 0 ? newValues.join(',') : null)
  }

  const maxShownItems = 1
  const visibleItems = expanded ? selectedValues : selectedValues.slice(0, maxShownItems)
  const hiddenCount = selectedValues.length - visibleItems.length

  return (
    <div className={cn('w-full min-w-0', !compact && inline ? 'flex items-center gap-2' : !compact && 'space-y-1.5')}>
      {!compact && (
        <Label
          htmlFor={id}
          className={cn(
            'text-[10px] uppercase font-bold text-slate-400',
            inline && 'shrink-0 w-[4.75rem] leading-tight'
          )}
        >
          POIs
        </Label>
      )}
      <div className={cn(!compact && inline && 'flex-1 min-w-0')}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn(
                'w-full justify-between border-slate-200',
                compact
                  ? 'h-8 px-2.5 bg-slate-50 hover:bg-slate-50 text-xs font-medium shadow-none'
                  : 'h-9 px-3 hover:bg-transparent bg-white'
              )}
            >
              <div className="flex flex-wrap items-center gap-1 overflow-hidden pr-2 min-w-0">
                {compact && selectedValues.length > 0 ? (
                  <span className="truncate text-xs font-semibold text-slate-800">
                    {selectedValues.length === 1
                      ? labelFor(selectedValues[0])
                      : `${selectedValues.length} POIs`}
                  </span>
                ) : selectedValues.length > 0 ? (
                  <>
                    {visibleItems.map((val) => (
                      <Badge
                        key={val}
                        variant="secondary"
                        className="rounded-sm px-1.5 h-6 font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border-none"
                      >
                        <span className="truncate max-w-[80px] text-[10px]">{labelFor(val)}</span>
                        <div
                          role="button"
                          tabIndex={0}
                          className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer flex items-center"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation()
                              removeSelection(val)
                            }
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            removeSelection(val)
                          }}
                        >
                          <XIcon className="size-3 text-slate-500 hover:text-slate-900" />
                        </div>
                      </Badge>
                    ))}
                    {!expanded && hiddenCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="rounded-sm px-1.5 h-6 text-[10px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border-none cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpanded(true)
                        }}
                      >
                        +{hiddenCount}
                      </Badge>
                    )}
                    {expanded && hiddenCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="rounded-sm px-1.5 h-6 text-[10px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border-none cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpanded(false)
                        }}
                      >
                        Less
                      </Badge>
                    )}
                  </>
                ) : (
                  <span className={cn('text-xs font-semibold', compact ? 'text-slate-500' : 'text-slate-900')}>
                    {compact ? 'POIs' : 'All POIs'}
                  </span>
                )}
              </div>
              <ChevronsUpDownIcon className="text-slate-400 shrink-0 size-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search POIs..." className="text-xs h-9" />
              <CommandList>
                <CommandEmpty className="text-xs p-4 text-center text-slate-500">No POIs found.</CommandEmpty>
                <CommandGroup>
                  {poiOptions.map((poi) => (
                    <CommandItem
                      key={poi.name}
                      value={`${poi.display_name || ''} ${poi.name}`}
                      onSelect={() => toggleSelection(poi.name)}
                      className="text-xs"
                    >
                      <span className="truncate">{poi.display_name || poi.name}</span>
                      {selectedValues.includes(poi.name) && <CheckIcon size={14} className="ml-auto text-blue-600" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
