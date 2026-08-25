'use client'

import { FileText, Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'posts', label: 'Posts', icon: FileText },
  { value: 'ads', label: 'Ads', icon: Megaphone },
]

export default function IngestKindToggle({
  value = 'posts',
  onChange,
  adsEnabled = true,
  className,
}) {
  const options = adsEnabled ? OPTIONS : OPTIONS.filter((opt) => opt.value === 'posts')

  if (options.length < 2) return null

  return (
    <div
      role="group"
      aria-label="Content type"
      className={cn(
        'inline-flex w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1',
        className
      )}
    >
      {options.map((opt) => {
        const selected = value === opt.value
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange?.(opt.value)}
            className={cn(
              'flex-1 sm:flex-none cursor-pointer inline-flex items-center justify-center gap-1.5 h-8 px-4 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all',
              selected
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                : 'bg-transparent text-slate-500 hover:text-slate-800 hover:bg-white'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
