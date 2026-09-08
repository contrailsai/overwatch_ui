'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { uniqueCloakVariants, cloakVariantKey } from '@/lib/domains/domain-display'

function variantShot(v, primaryScreenshotUrl) {
  return (
    v?.signedScreenshotUrl
    || v?.screenshot?.s3_url
    || v?.screenshot?.url
    || (v?.label === 'bare' || v?.kind === 'scam' ? primaryScreenshotUrl : null)
  )
}

function tabLabel(v) {
  if (v.label === 'bare') return 'Bare'
  return v.param || v.label || 'Variant'
}

/**
 * Reviewer-only: pick which differing landers the client filmstrip may show.
 * Empty selection means the client sees every different lander.
 */
export function ClientVisibleLandersPicker({
  variants = [],
  selectedKeys = [],
  onChange,
  primaryScreenshotUrl = null,
}) {
  const list = uniqueCloakVariants(variants)
  if (list.length === 0) return null

  const selected = new Set((selectedKeys || []).map(String).filter(Boolean))
  const noneChecked = selected.size === 0

  const toggle = (key) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange?.(Array.from(next))
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
          Client-visible landers
        </h4>
        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
          Unchecked landers stay in the review queue only. If none are checked, the client sees every different lander.
        </p>
        {noneChecked && (
          <p className="text-[10px] font-semibold text-emerald-700 mt-1.5">
            Currently showing all landers to the client
          </p>
        )}
      </div>
      <ul className="divide-y divide-slate-50">
        {list.map((v, idx) => {
          const key = cloakVariantKey(v)
          const checked = selected.has(key)
          const thumb = variantShot(v, primaryScreenshotUrl)
          return (
            <li key={`${key}-${idx}`}>
              <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50/80">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(key)}
                  className="border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                />
                <div className="h-9 w-9 rounded border border-slate-200 bg-slate-100 overflow-hidden shrink-0">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-full w-full object-cover object-top" />
                  ) : (
                    <div className="h-full w-full bg-slate-100" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-800 truncate">{tabLabel(v)}</p>
                  <p className="text-[10px] text-slate-400 truncate">{v.url || '—'}</p>
                </div>
                {v.kind && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[9px] font-bold uppercase shrink-0',
                      v.kind === 'scam'
                        ? 'border-rose-200 text-rose-700 bg-rose-50'
                        : v.kind === 'dummy'
                          ? 'border-slate-200 text-slate-600'
                          : 'border-violet-200 text-violet-700 bg-violet-50',
                    )}
                  >
                    {v.kind}
                  </Badge>
                )}
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
