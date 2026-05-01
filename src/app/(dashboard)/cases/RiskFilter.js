'use client'

import { useId, useState, useEffect } from 'react'
import { CheckIcon, ChevronsUpDownIcon, XIcon, Siren, TriangleAlert, TrendingDown, Smile } from 'lucide-react'

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
import { cn } from "@/lib/utils"

const RISK_LEVELS = [
  { id: 'high', label: 'High Risk', icon: Siren, color: 'text-rose-500 bg-rose-50 border-rose-200' },
  { id: 'medium', label: 'Medium Risk', icon: TriangleAlert, color: 'text-orange-500 bg-orange-50 border-orange-200' },
  { id: 'low', label: 'Low Risk', icon: TrendingDown, color: 'text-amber-500 bg-amber-50 border-amber-200' },
  { id: 'safe', label: 'Safe', icon: Smile, color: 'text-slate-500 bg-slate-50 border-slate-200' },
]

export function RiskFilter({ initialRisk = 'all', onChange }) {
  const id = useId()
  const [open, setOpen] = useState(false)

  const selectedLevel = RISK_LEVELS.find(level => level.id === initialRisk)

  return (
    <div className='w-full space-y-1.5'>
      <Label htmlFor={id} className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Risk Severity</Label>
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
              {selectedLevel ? (
                <div className={cn("flex items-center px-2 py-0.5 text-[10px] font-bold tracking-wider")}>
                  {selectedLevel.label}
                </div>
              ) : (
                <span className='text-xs font-semibold text-slate-700'>All Risks</span>
              )}
            </div>
            <ChevronsUpDownIcon className='text-slate-400 shrink-0 size-4' aria-hidden='true' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-[200px] p-0' align="start">
          <Command>
            <CommandInput placeholder='Search risk levels...' className="text-xs h-9" />
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
                  <div className="flex items-center gap-2">
                    <span>All Risks</span>
                  </div>
                  {initialRisk === 'all' && <CheckIcon size={14} className='ml-auto text-blue-600' />}
                </CommandItem>
                {RISK_LEVELS.map(level => (
                  <CommandItem
                    key={level.id}
                    value={level.id}
                    onSelect={() => {
                      onChange(level.id)
                    }}
                    className="text-xs font-semibold"
                  >
                    <div className="flex items-center gap-2">
                      <span>{level.label}</span>
                    </div>
                    {initialRisk === level.id && <CheckIcon size={14} className='ml-auto text-blue-600' />}
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
