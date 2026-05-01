'use client'

import { useId, useState } from 'react'
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react'

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
import { cn } from "@/lib/utils"

export function StatusFilter({ 
  initialStatus = 'all', 
  onChange, 
  options = [], 
  label = "Status",
  placeholder = "All Statuses"
}) {
  const id = useId()
  const [open, setOpen] = useState(false)

  const selectedOption = options.find(opt => opt.value === initialStatus)

  return (
    <div className='w-full space-y-1.5'>
      <Label htmlFor={id} className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant='outline'
            role='combobox'
            aria-expanded={open}
            className='h-9 w-full justify-between hover:bg-transparent bg-white border-slate-200 px-3'
          >
            <div className='flex items-center gap-2 overflow-hidden'>
              {selectedOption ? (
                <span className='text-xs font-semibold text-slate-700'>{selectedOption.label}</span>
              ) : (
                <span className='text-xs font-semibold text-slate-700'>{placeholder}</span>
              )}
            </div>
            <ChevronsUpDownIcon className='text-slate-400 shrink-0 size-4' aria-hidden='true' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-[200px] p-0' align="start">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}...`} className="text-xs h-9" />
            <CommandList>
              <CommandEmpty className="text-xs p-4 text-center text-slate-500">No results found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="all"
                  onSelect={() => {
                    onChange('all')
                  }}
                  className="text-xs font-semibold"
                >
                  <span>{placeholder}</span>
                  {initialStatus === 'all' && <CheckIcon size={14} className='ml-auto text-blue-600' />}
                </CommandItem>
                {options.map(option => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      onChange(option.value)
                    }}
                    className="text-xs font-semibold"
                  >
                    <span>{option.label}</span>
                    {initialStatus === option.value && <CheckIcon size={14} className='ml-auto text-blue-600' />}
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
