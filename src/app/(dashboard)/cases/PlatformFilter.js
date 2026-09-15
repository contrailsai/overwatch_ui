'use client'

import { useId, useState } from 'react'
import { CheckIcon, ChevronsUpDownIcon, Instagram, Facebook, Youtube } from 'lucide-react'
import { Twitter, Reddit } from '@/utils/icons'

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

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: Instagram },
  { id: 'facebook', label: 'Facebook', icon: Facebook },
  { id: 'x', label: 'X (Twitter)', icon: Twitter },
  { id: 'reddit', label: 'Reddit', icon: Reddit },
  { id: 'youtube', label: 'YouTube', icon: Youtube },
  { id: 'website', label: 'Websites', icon: null },
]

export function PlatformFilter({
  initialPlatform = 'all',
  onChange,
  availablePlatforms = [],
  inline = false,
  compact = false,
}) {
  const id = useId()
  const [open, setOpen] = useState(false)

  const selectedPlatform = PLATFORMS.find(p => p.id === initialPlatform)

  const filteredPlatforms = availablePlatforms.length > 0
    ? PLATFORMS.filter(p => availablePlatforms.includes(p.id))
    : PLATFORMS

  return (
    <div className={cn('w-full min-w-0', !compact && inline ? 'flex items-center gap-2' : !compact && 'space-y-1.5')}>
      {!compact && (
        <Label
          htmlFor={id}
          className={cn(
            'text-[10px] uppercase font-bold text-slate-400 tracking-wider',
            inline && 'shrink-0 w-[4.75rem] leading-tight'
          )}
        >
          Platform
        </Label>
      )}
      <div className={cn(!compact && inline && 'flex-1 min-w-0')}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              variant='outline'
              role='combobox'
              aria-expanded={open}
              className={cn(
                'w-full justify-between border-slate-200',
                compact
                  ? 'h-8 px-2.5 bg-slate-50 hover:bg-slate-50 text-xs font-medium shadow-none'
                  : 'h-9 px-3 hover:bg-transparent bg-white'
              )}
            >
              <div className='flex items-center gap-2 overflow-hidden'>
                {selectedPlatform ? (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 truncate">
                    {selectedPlatform.label}
                  </div>
                ) : (
                  <span className='text-xs font-semibold text-slate-700'>
                    {compact ? 'Platform' : 'All Platforms'}
                  </span>
                )}
              </div>
              <ChevronsUpDownIcon className='text-slate-400 shrink-0 size-4' aria-hidden='true' />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-[200px] p-0' align="start">
            <Command>
              <CommandInput placeholder='Search platforms...' className="text-xs h-9" />
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
                    <span>All Platforms</span>
                    {initialPlatform === 'all' && <CheckIcon size={14} className='ml-auto text-blue-600' />}
                  </CommandItem>
                  {filteredPlatforms.map(platform => (
                    <CommandItem
                      key={platform.id}
                      value={platform.id}
                      onSelect={() => {
                        onChange(platform.id)
                      }}
                      className="text-xs font-semibold"
                    >
                      <div className="flex items-center gap-2">
                        <span>{platform.label}</span>
                      </div>
                      {initialPlatform === platform.id && <CheckIcon size={14} className='ml-auto text-blue-600' />}
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
