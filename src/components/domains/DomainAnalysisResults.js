import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { uniqueCloakVariants } from '@/lib/domains/domain-display'

function formatMaybeDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return format(d, 'dd MMM yyyy')
}

function InfoRow({ label, value }) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return null
  const display = Array.isArray(value) ? value.join(', ') : String(value)
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">{label}</span>
      <span className="text-xs font-semibold text-slate-700 text-right break-all">{display}</span>
    </div>
  )
}

function ModuleCard({ title, children }) {
  if (!children) return null
  return (
    <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/60">
      <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{title}</h5>
      {children}
    </div>
  )
}

/** Compact domain intel: cloak summary + WHOIS/hosting. Extra modules behind disclosure. */
export function DomainAnalysisResults({ analysisResults }) {
  const results = analysisResults && typeof analysisResults === 'object' ? analysisResults : {}
  const keys = Object.keys(results)
  const [showMore, setShowMore] = useState(false)

  if (keys.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic">
        No analyzer results yet — review manually and revisit once analysis completes.
      </p>
    )
  }

  const whois = results.whois || {}
  const dns = results.dns || {}
  const ssl = results.ssl || {}
  const hosting = results.hosting || {}
  const reputation = results.reputation || {}
  const content = results.content_classification || {}
  const techStack = Array.isArray(results.tech_stack) ? results.tech_stack : []
  const redirectChain = Array.isArray(results.redirect_chain) ? results.redirect_chain : []
  const cloak = results.cloak_probe || {}
  const unique = uniqueCloakVariants(cloak.variants || [])
  const unlocked = unique.filter((v) => v.label !== 'bare' && v.differs_from_bare)

  const hasMore =
    Boolean(dns.ns || dns.a || dns.nameservers)
    || techStack.length > 0
    || redirectChain.length > 0
    || Boolean(reputation.notes)

  return (
    <div className="space-y-3">
      <ModuleCard title="Cloak probe">
        <InfoRow label="Unlocked" value={cloak.unlocked || unlocked.length > 0 ? 'Yes' : 'No'} />
        <InfoRow
          label="Landers shown"
          value={`${unique.length} (bare${unlocked.length ? ` + ${unlocked.length} different` : ' only'})`}
        />
        {unlocked.length > 0 && (
          <InfoRow
            label="Different params"
            value={unlocked.map((v) => v.param || v.label).filter(Boolean)}
          />
        )}
        <p className="text-[10px] text-slate-400 mt-1.5">
          Use the lander switcher above for screenshots and openable URLs.
        </p>
      </ModuleCard>

      {(content.title || content.summary || content.category) && (
        <ModuleCard title="Page signals">
          {content.title && (
            <p className="text-sm font-bold text-slate-800 leading-snug mb-1">{content.title}</p>
          )}
          {content.summary && (
            <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{content.summary}</p>
          )}
          <div className="mt-2">
            <InfoRow label="Category" value={content.category} />
            <InfoRow label="Spoofed brands" value={content.spoofed_brands} />
          </div>
          {(content.labels || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {content.labels.slice(0, 6).map((label) => (
                <Badge
                  key={label}
                  variant="outline"
                  className="text-[10px] font-semibold capitalize border-slate-200 text-slate-600"
                >
                  {String(label).replace(/[-_]/g, ' ')}
                </Badge>
              ))}
            </div>
          )}
        </ModuleCard>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ModuleCard title="WHOIS">
          <InfoRow label="Registrar" value={whois.registrar} />
          <InfoRow label="Created" value={formatMaybeDate(whois.created_at)} />
          <InfoRow label="Age (days)" value={whois.age_days_at_analysis} />
          <InfoRow
            label="Privacy"
            value={whois.privacy_protected == null ? null : (whois.privacy_protected ? 'Yes' : 'No')}
          />
          <InfoRow label="Country" value={whois.registrant_country} />
        </ModuleCard>
        <ModuleCard title="Hosting / SSL">
          <InfoRow label="Provider" value={hosting.provider} />
          <InfoRow label="Country" value={hosting.country} />
          <InfoRow label="CDN" value={hosting.is_cdn == null ? null : (hosting.is_cdn ? 'Yes' : 'No')} />
          <InfoRow label="SSL issuer" value={ssl.issuer} />
          <InfoRow label="SSL valid" value={ssl.is_valid == null ? null : (ssl.is_valid ? 'Yes' : 'No')} />
        </ModuleCard>
      </div>

      {hasMore && (
        <div>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800"
          >
            {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showMore ? 'Less intel' : 'More intel'}
          </button>
          {showMore && (
            <div className="mt-2 space-y-3">
              {(dns.ns || dns.a || dns.nameservers) && (
                <ModuleCard title="DNS">
                  <InfoRow label="Nameservers" value={dns.nameservers || dns.ns} />
                  <InfoRow label="A" value={dns.a} />
                  <InfoRow label="MX" value={dns.mx} />
                </ModuleCard>
              )}
              {techStack.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {techStack.map((item) => (
                    <Badge
                      key={item}
                      variant="outline"
                      className="text-[10px] font-semibold capitalize border-slate-200 text-slate-600"
                    >
                      {String(item).replace(/[-_]/g, ' ')}
                    </Badge>
                  ))}
                </div>
              )}
              {redirectChain.length > 0 && (
                <ModuleCard title="Redirect chain">
                  <ol className="space-y-1">
                    {redirectChain.slice(0, 6).map((hop, idx) => (
                      <li key={`${hop?.url || idx}`} className="text-[11px] font-semibold text-slate-600 break-all">
                        {hop?.status_code || '—'} · {hop?.url || '—'}
                      </li>
                    ))}
                  </ol>
                </ModuleCard>
              )}
              {reputation.notes && (
                <p className="text-[11px] text-slate-500 italic">{reputation.notes}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
