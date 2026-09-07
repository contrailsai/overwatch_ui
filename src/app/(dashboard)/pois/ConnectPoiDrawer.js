'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import { connectPoiAsAlias, searchPoisForConnect } from './actions'

function Picker({ label, hint, value, onChange, excludeId }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await searchPoisForConnect({ query, excludeId, limit: 12 })
        if (!cancelled) setResults(res?.pois || [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, query ? 200 : 0)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query, excludeId])

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{value.display_name}</p>
            <p className="text-xs text-slate-500 truncate">
              {(value.post_count || 0).toLocaleString()} posts
              {value.meta?.title ? ` · ${value.meta.title}` : ''}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onChange(null)}
            aria-label={`Clear ${label}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or alias…"
              className="w-full h-9 pl-9 pr-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {loading ? (
              <p className="px-3 py-4 text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching…
              </p>
            ) : results.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-500">No parent POIs found</p>
            ) : (
              results.map((poi) => (
                <button
                  key={poi._id}
                  type="button"
                  onClick={() => onChange(poi)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors"
                >
                  <p className="text-sm font-medium text-slate-900 truncate">{poi.display_name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {(poi.post_count || 0).toLocaleString()} posts
                    {poi.meta?.title ? ` · ${poi.meta.title}` : ''}
                  </p>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function ConnectPoiDrawer({ open, onOpenChange, onConnected }) {
  const [alias, setAlias] = useState(null)
  const [parent, setParent] = useState(null)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) {
      setAlias(null)
      setParent(null)
      setError('')
    }
  }, [open])

  const canSubmit = Boolean(alias?._id && parent?._id && alias._id !== parent._id) && !isPending

  const onSubmit = () => {
    setError('')
    startTransition(async () => {
      try {
        const res = await connectPoiAsAlias(alias._id, parent._id)
        if (!res?.success) {
          setError(res?.error || 'Failed to connect POIs')
          return
        }
        onOpenChange(false)
        onConnected?.(res.poi)
      } catch (err) {
        setError(err?.message || 'Failed to connect POIs')
      }
    })
  }

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="p-0 gap-0">
        <DrawerHeader className="shrink-0 px-5 py-4 border-b border-slate-100 text-left">
          <DrawerTitle>Connect as alias</DrawerTitle>
          <DrawerDescription>
            Keep the alias document, attach it to a parent, and merge non-conflicting fields. Searching an alias name still returns its parent.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <Picker
            label="Alias"
            hint="This POI will be hidden and redirect to the parent."
            value={alias}
            onChange={setAlias}
            excludeId={parent?._id}
          />
          <Picker
            label="Parent"
            hint="Canonical POI that stays visible."
            value={parent}
            onChange={setParent}
            excludeId={alias?._id}
          />
          {alias && parent && alias._id === parent._id ? (
            <p className="text-xs text-amber-700">Choose two different POIs.</p>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <DrawerFooter className="shrink-0 border-t border-slate-100 px-5 py-4 flex-row justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className={cn(!canSubmit && 'opacity-60')}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Connect
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
