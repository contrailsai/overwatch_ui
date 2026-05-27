'use client'

import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { CasesFilterPanel } from './CasesFilterPanel'

export function MobileCasesFilterDrawer({
  open,
  onOpenChange,
  totalCount,
  isPending,
  hasActiveFilters,
  onClearFilters,
  filterPanelProps,
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="lg:hidden max-h-[96dvh] p-0 gap-0 flex flex-col">
        <DrawerHeader className="shrink-0 px-4 pt-2 pb-3 border-b border-slate-100 text-left space-y-0">
          <div className="mx-auto w-10 h-1 rounded-full bg-slate-300 mb-3" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DrawerTitle className="text-lg font-black text-slate-800">Filters</DrawerTitle>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black text-slate-800 tabular-nums leading-none">
                  {totalCount.toLocaleString()}
                </span>
                <span className="text-xs font-semibold text-slate-500">cases</span>
                {isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 shrink-0" />
                )}
              </div>
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearFilters}
                className="shrink-0 h-8 px-2 text-rose-600 hover:bg-rose-50 text-[10px] font-bold uppercase"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </DrawerHeader>

        <div className="flex flex-1 min-h-0 flex-col overflow-hidden px-4">
          <CasesFilterPanel
            layout="stacked"
            showSections
            debouncedSearch
            contextualPlacement="top"
            mobileDrawerLayout
            onMobileDrawerDone={() => onOpenChange(false)}
            {...filterPanelProps}
          />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
