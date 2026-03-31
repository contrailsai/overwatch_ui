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

export function ViolationsFilter({ projectLabels = [], initialViolations = '', onChange }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const allLabels = [...projectLabels];
  if (!allLabels.find(l => l.name === 'aigc')) {
    allLabels.push({ name: 'aigc' });
  }

  // Parse initial string 'hate-speech,fraud' into array
  const [selectedValues, setSelectedValues] = useState([])

  useEffect(() => {
    const newValues = initialViolations && initialViolations !== 'all' ? initialViolations.split(',') : [];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedValues(newValues);
  }, [initialViolations]);

  const toggleSelection = (value) => {
    const newValues = selectedValues.includes(value)
      ? selectedValues.filter(v => v !== value)
      : [...selectedValues, value];
    setSelectedValues(newValues);
    onChange(newValues.length > 0 ? newValues.join(',') : null);
  }

  const removeSelection = (value) => {
    const newValues = selectedValues.filter(v => v !== value);
    setSelectedValues(newValues);
    onChange(newValues.length > 0 ? newValues.join(',') : null);
  }

  const maxShownItems = 1
  const visibleItems = expanded ? selectedValues : selectedValues.slice(0, maxShownItems)
  const hiddenCount = selectedValues.length - visibleItems.length

  return (
    <div className='w-full space-y-1.5'>
      <Label htmlFor={id} className="text-[10px] uppercase font-bold text-slate-400">Violations</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant='outline'
            role='combobox'
            aria-expanded={open}
            className='h-9 w-full justify-between hover:bg-transparent bg-white border-slate-200 px-3'
          >
            <div className='flex flex-wrap items-center gap-1 overflow-hidden pr-2'>
              {selectedValues.length > 0 ? (
                <>
                  {visibleItems.map(val => {
                    const labelObj = allLabels.find(l => l.name === val)
                    let displayLabel = labelObj ? labelObj.name.replace(/[-_]/g, ' ') : val.replace(/[-_]/g, ' ')
                    if (val === 'aigc') displayLabel = 'AIGC'

                    return (
                      <Badge key={val} variant='secondary' className={`rounded-sm px-1.5 h-6 font-semibold ${val === 'aigc' ? 'uppercase' : 'capitalize'} bg-slate-100 text-slate-700 hover:bg-slate-200 border-none`}>
                        <span className="truncate max-w-[80px] text-[10px]">{displayLabel}</span>
                        <div
                          role="button"
                          tabIndex={0}
                          className='ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer flex items-center'
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              removeSelection(val);
                            }
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeSelection(val);
                          }}
                        >
                          <XIcon className='size-3 text-slate-500 hover:text-slate-900' />
                        </div>
                      </Badge>
                    )
                  })}
                  {!expanded && hiddenCount > 0 && (
                    <Badge
                      variant='secondary'
                      className='rounded-sm px-1.5 h-6 text-[10px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border-none cursor-pointer'
                      onClick={e => {
                        e.stopPropagation()
                        setExpanded(true)
                      }}
                    >
                      +{hiddenCount}
                    </Badge>
                  )}
                  {expanded && hiddenCount > 0 && (
                    <Badge
                      variant='secondary'
                      className='rounded-sm px-1.5 h-6 text-[10px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border-none cursor-pointer'
                      onClick={e => {
                        e.stopPropagation()
                        setExpanded(false)
                      }}
                    >
                      Less
                    </Badge>
                  )}
                </>
              ) : (
                <span className=' text-xs font-semibold'>All Violations</span>
              )}
            </div>
            <ChevronsUpDownIcon className='text-slate-400 shrink-0 size-4' aria-hidden='true' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-[200px] p-0' align="start">
          <Command>
            <CommandInput placeholder='Search violations...' className="text-xs h-9" />
            <CommandList>
              <CommandEmpty className="text-xs p-4 text-center text-slate-500">No violations found.</CommandEmpty>
              <CommandGroup>
                {allLabels.map(label => (
                  <CommandItem
                    key={label.name}
                    value={label.name}
                    onSelect={() => toggleSelection(label.name)}
                    className={`text-xs ${label.name === 'aigc' ? 'uppercase' : 'capitalize'}`}
                  >
                    <span className='truncate'>{label.name === 'aigc' ? 'AIGC' : label.name.replace(/[-_]/g, ' ')}</span>
                    {selectedValues.includes(label.name) && <CheckIcon size={14} className='ml-auto text-blue-600' />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
