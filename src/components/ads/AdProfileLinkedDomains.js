'use client'

import { ExternalLink, Eye, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

function riskBadgeClass(risk) {
  const v = String(risk || '').toLowerCase()
  if (v === 'high') return 'bg-rose-50 text-rose-700 border-rose-200'
  if (v === 'mid' || v === 'medium') return 'bg-orange-50 text-orange-700 border-orange-200'
  if (v === 'low') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (v === 'safe') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return 'bg-slate-50 text-slate-600 border-slate-200'
}

/**
 * Compact list of reviewed domains linked from an advertiser's ads.
 * @param {{ domains: object[], hrefBase?: string, emptyLabel?: string, className?: string }} props
 */
export function AdProfileLinkedDomains({
  domains = [],
  hrefBase = '/domains',
  emptyLabel = 'No reviewed domains linked from this advertiser’s ads.',
  className,
}) {
  if (!domains.length) {
    return (
      <p className={cn('text-xs text-slate-400 italic px-1 py-2', className)}>
        {emptyLabel}
      </p>
    )
  }

  return (
    <ul className={cn('space-y-2.5', className)}>
      {domains.map((domain) => {
        const domainHref = domain._id ? `${hrefBase}?domain_id=${domain._id}` : null
        const riskLabel = domain.risk
          ? String(domain.risk).replace(/\b\w/g, (c) => c.toUpperCase())
          : null

        return (
          <li
            key={domain._id || domain.domain_name}
            className="rounded-xl border border-slate-200 bg-white p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-slate-900 font-mono truncate inline-flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  {domain.domain_name}
                </p>
                <div className="flex flex-wrap gap-1">
                  {riskLabel ? (
                    <Badge variant="outline" className={cn('h-5 text-[10px] font-bold', riskBadgeClass(domain.risk))}>
                      {riskLabel} Risk
                    </Badge>
                  ) : null}
                  {domain.category ? (
                    <Badge variant="outline" className="h-5 text-[10px] font-semibold capitalize border-slate-200 text-slate-600">
                      {String(domain.category).replace(/[-_]/g, ' ')}
                    </Badge>
                  ) : null}
                  {domain.hasScamLander ? (
                    <Badge variant="outline" className="h-5 text-[10px] font-bold border-rose-200 bg-rose-50 text-rose-700">
                      Scam lander
                    </Badge>
                  ) : null}
                  {domain.cloakUnlocked ? (
                    <Badge variant="outline" className="h-5 text-[10px] font-bold border-amber-200 bg-amber-50 text-amber-800">
                      Cloaking
                    </Badge>
                  ) : null}
                  {domain.adCount > 0 ? (
                    <Badge variant="outline" className="h-5 text-[10px] font-semibold border-slate-200 text-slate-500">
                      {domain.adCount} ad{domain.adCount === 1 ? '' : 's'}
                    </Badge>
                  ) : null}
                </div>
              </div>
              {domainHref ? (
                <a
                  href={domainHref}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
                >
                  <Eye className="h-3 w-3" />
                  Open
                  <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                </a>
              ) : null}
            </div>
            {domain.pageTitle ? (
              <p className="text-xs font-semibold text-slate-800 leading-snug">{domain.pageTitle}</p>
            ) : null}
            {domain.pageSummary ? (
              <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{domain.pageSummary}</p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
