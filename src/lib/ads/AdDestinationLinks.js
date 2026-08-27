'use client'

import { ExternalLink, Globe, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { getAdDestinationLinks } from '@/lib/ads/ad-display'

function resolveDomainForLink(link, domainsByHost) {
  if (!domainsByHost || !link?.host) return null
  return domainsByHost[String(link.host).toLowerCase()] || null
}

function DestinationRow({ link, isActive, compact = false }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 min-w-0',
        isActive && 'rounded-md bg-slate-100 px-1.5 py-1 -mx-1.5',
      )}
    >
      {link.label ? (
        <span className="shrink-0 text-[11px] font-medium text-slate-400 tabular-nums pt-0.5 min-w-[3.25rem]">
          {link.label}
        </span>
      ) : null}
      <a
        href={link.url}
        target="_blank"
        rel="noreferrer"
        title={link.url}
        className={cn(
          'text-blue-600 break-all inline-flex items-start gap-1 hover:underline min-w-0',
          compact ? 'text-sm' : '',
        )}
      >
        <span>{compact ? link.display : link.url}</span>
        <ExternalLink className={cn('shrink-0 mt-0.5', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      </a>
    </div>
  )
}

/**
 * Destination URLs as stored on the ad (per-card + top-level).
 * No domain enrichment — original ad data only.
 */
export function AdDestinationLinks({
  ad,
  activeCard = 0,
  className,
}) {
  const links = getAdDestinationLinks(ad)

  if (links.length === 0) return null

  if (links.length === 1) {
    return (
      <div className={className}>
        <DestinationRow link={links[0]} />
      </div>
    )
  }

  return (
    <ul className={cn('space-y-1.5', className)}>
      {links.map((link) => {
        const isActive =
          link.cardIndexes?.length > 0 &&
          link.cardIndexes.includes(activeCard)
        return (
          <li key={link.url}>
            <DestinationRow link={link} isActive={isActive} compact />
          </li>
        )
      })}
    </ul>
  )
}

export function adDestinationLabel(ad) {
  return getAdDestinationLinks(ad).length > 1 ? 'Destinations' : 'Destination'
}

/**
 * Unique scam / cloaked target domains linked from this ad's destinations.
 * Separate from card destination rows — domain page opens in a new tab.
 */
/** All reviewed domains matched to this ad's destination hosts (order of first appearance). */
export function getAdLinkedDomains(ad, domainsByHost) {
  if (!domainsByHost) return []
  const links = getAdDestinationLinks(ad)
  const byName = new Map()

  for (const link of links) {
    const domain = resolveDomainForLink(link, domainsByHost)
    if (!domain) continue
    const key = String(domain.domain_name || '').toLowerCase()
    if (!key || byName.has(key)) continue
    byName.set(key, domain)
  }

  return Array.from(byName.values())
}

export function getAdTargetDomains(ad, domainsByHost) {
  return getAdLinkedDomains(ad, domainsByHost).filter(
    (domain) => domain.hasScamLander || domain.cloakUnlocked,
  )
}

export function AdTargetUrlsInfo({
  ad,
  domainsByHost = null,
  domainsHrefBase = null,
  className,
}) {
  const targets = getAdTargetDomains(ad, domainsByHost)
  if (targets.length === 0) return null

  return (
    <div className={cn('rounded-xl border border-rose-100 bg-rose-50/40 px-3.5 py-3 space-y-2.5', className)}>
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-rose-600 shrink-0" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700">
          Target URLs
        </p>
      </div>
      <ul className="space-y-2.5">
        {targets.map((domain) => {
          const domainHref = domain._id && domainsHrefBase
            ? `${domainsHrefBase}?domain_id=${domain._id}`
            : null
          let visitDisplay = domain.visitUrl
          if (domain.visitUrl) {
            try {
              const parsed = new URL(domain.visitUrl)
              const host = parsed.hostname.replace(/^www\./i, '')
              const pathQuery = `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}${parsed.hash}`
              visitDisplay = pathQuery ? `${host}${pathQuery}` : host
            } catch {
              visitDisplay = domain.visitUrl
            }
          }

          return (
            <li key={domain._id || domain.domain_name} className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-900">
                  {domain.domain_name}
                </span>
                {domain.hasScamLander ? (
                  <Badge
                    variant="outline"
                    className="h-5 px-1.5 text-[10px] font-bold border-rose-200 bg-rose-50 text-rose-700"
                  >
                    Scam lander
                  </Badge>
                ) : null}
                {domain.cloakUnlocked ? (
                  <Badge
                    variant="outline"
                    className="h-5 px-1.5 text-[10px] font-bold border-amber-200 bg-amber-50 text-amber-800"
                  >
                    Cloaking
                  </Badge>
                ) : null}
              </div>
              {domain.visitUrl ? (
                <a
                  href={domain.visitUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={domain.visitUrl}
                  className="text-sm text-blue-600 break-all inline-flex items-start gap-1 hover:underline"
                >
                  <span>{visitDisplay}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                </a>
              ) : null}
              {domainHref ? (
                <a
                  href={domainHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-blue-600 hover:underline"
                >
                  <Eye className="h-3 w-3 shrink-0" />
                  View domain
                  <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-70" />
                </a>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function riskBadgeClass(risk) {
  const v = String(risk || '').toLowerCase()
  if (v === 'high') return 'bg-rose-50 text-rose-700 border-rose-300'
  if (v === 'mid' || v === 'medium') return 'bg-orange-100 text-orange-800 border-orange-300'
  if (v === 'low') return 'bg-amber-100 text-amber-800 border-amber-300'
  if (v === 'safe') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return 'bg-slate-50 text-slate-600 border-slate-200'
}

/**
 * Right-pane domain analysis cards for destinations linked from this ad.
 * Shows reviewed domain intel + deep-link to /domains.
 */
export function AdLinkedDomainsAnalysis({
  ad,
  domainsByHost = null,
  domainsHrefBase = null,
  className,
}) {
  const linked = getAdLinkedDomains(ad, domainsByHost)

  if (domainsByHost == null) {
    return (
      <div className={cn('space-y-2', className)}>
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Linked Domain Analysis
        </h4>
        <p className="text-xs text-slate-400 italic">Loading domain matches…</p>
      </div>
    )
  }

  if (linked.length === 0) {
    return (
      <div className={cn('space-y-2', className)}>
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Linked Domain Analysis
        </h4>
        <p className="text-xs text-slate-400 italic">
          No reviewed domains matched this ad&apos;s destinations.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
        Linked Domain Analysis
      </h4>
      <ul className="space-y-2.5">
        {linked.map((domain) => {
          const domainHref = domain._id && domainsHrefBase
            ? `${domainsHrefBase}?domain_id=${domain._id}`
            : null
          const riskLabel = domain.risk
            ? String(domain.risk).replace(/\b\w/g, (c) => c.toUpperCase())
            : null

          return (
            <li
              key={domain._id || domain.domain_name}
              className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-slate-900 font-mono truncate">
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
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{domain.pageSummary}</p>
              ) : null}
              {domain.reviewReasoning ? (
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap line-clamp-4">
                  {domain.reviewReasoning}
                </p>
              ) : null}

              {(domain.registrar || domain.hostingProvider || domain.hostingCountry) ? (
                <div className="grid grid-cols-1 gap-0.5 text-[11px] text-slate-500">
                  {domain.registrar ? <p><span className="font-semibold text-slate-400">Registrar </span>{domain.registrar}</p> : null}
                  {domain.hostingProvider ? <p><span className="font-semibold text-slate-400">Hosting </span>{domain.hostingProvider}{domain.hostingCountry ? ` · ${domain.hostingCountry}` : ''}</p> : null}
                </div>
              ) : null}

              {domain.threatTypes?.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {domain.threatTypes.slice(0, 6).map((t) => (
                    <Badge key={t} variant="outline" className="h-5 text-[10px] font-semibold capitalize border-slate-200 text-slate-600">
                      {String(t).replace(/[-_]/g, ' ')}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {domain.legalCodes?.length > 0 ? (
                <div className="space-y-1.5 pt-1 border-t border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Legal codes</p>
                  {domain.legalCodes.slice(0, 3).map((item, idx) => (
                    <div key={`${item.code}-${idx}`} className="text-xs">
                      <span className="font-semibold text-rose-800">{item.code}</span>
                      {item.reasoning ? (
                        <p className="text-slate-600 leading-relaxed mt-0.5 line-clamp-2">{item.reasoning}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
