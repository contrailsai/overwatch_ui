'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { uploadFileViaPresignedUrl } from '@/utils/aws/upload-via-presigned-url'
import {
  updatePoi,
  initPoiImageUpload,
  confirmPoiImageUpload,
} from '../../actions'

export function PoiEditForm({ poi: initialPoi }) {
  const router = useRouter()
  const fileRef = useRef(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploading, setUploading] = useState(false)

  const [displayName, setDisplayName] = useState(initialPoi.display_name || '')
  const [summary, setSummary] = useState(initialPoi.summary || '')
  const [tier, setTier] = useState(initialPoi.tier || 'other')
  const [title, setTitle] = useState(initialPoi.meta?.title || '')
  const [organization, setOrganization] = useState(initialPoi.meta?.organization || '')
  const [state, setState] = useState(initialPoi.meta?.state || '')
  const [notes, setNotes] = useState(initialPoi.meta?.notes || '')
  const [aliasesText, setAliasesText] = useState(
    (initialPoi.aliases || []).join(', ')
  )
  const [imageUrl, setImageUrl] = useState(initialPoi.image?.signed_url || null)

  const parseAliases = () =>
    aliasesText
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)

  const onSave = () => {
    setError('')
    setSuccess('')
    startTransition(async () => {
      const res = await updatePoi(initialPoi._id, {
        display_name: displayName,
        summary,
        tier,
        meta: { title, organization, state, notes },
        aliases: parseAliases(),
      })
      if (!res?.success) {
        setError(res?.error || 'Failed to save')
        return
      }
      setSuccess('Saved')
      router.refresh()
      setTimeout(() => router.push(`/pois/${initialPoi._id}`), 400)
    })
  }

  const onImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    try {
      if (!file.type?.startsWith('image/')) {
        throw new Error('Only image files are allowed')
      }
      const init = await initPoiImageUpload(initialPoi._id, {
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      })
      if (!init?.success) throw new Error(init?.error || 'Failed to init upload')

      await uploadFileViaPresignedUrl(file, init.uploadUrl)

      const confirm = await confirmPoiImageUpload(initialPoi._id, {
        s3Key: init.s3Key,
        s3Url: init.s3Url,
        contentType: file.type,
      })
      if (!confirm?.success) throw new Error(confirm?.error || 'Failed to confirm upload')

      setImageUrl(confirm.poi?.image?.signed_url || init.s3Url)
      setSuccess('Image updated')
      router.refresh()
    } catch (err) {
      setError(err.message || 'Image upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-4 shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/pois/${initialPoi._id}`}
            className="p-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight truncate">
              Edit POI
            </h1>
            <p className="text-sm text-slate-500 truncate">{initialPoi.display_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" asChild disabled={isPending}>
            <Link href={`/pois/${initialPoi._id}`}>Cancel</Link>
          </Button>
          <Button
            onClick={onSave}
            disabled={isPending || uploading}
            className="bg-slate-900 hover:bg-slate-800"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Save
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {(error || success) && (
            <div
              className={cn(
                'rounded-lg border px-4 py-3 text-sm',
                error
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              )}
            >
              {error || success}
            </div>
          )}

          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Profile image
            </h2>
            <div className="flex items-center gap-4">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt=""
                  className="h-20 w-20 rounded-full object-cover border border-slate-200"
                />
              ) : (
                <div className="h-20 w-20 rounded-full bg-slate-200 flex items-center justify-center text-2xl font-semibold text-slate-600">
                  {(displayName || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onImageChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <Upload className="h-4 w-4 mr-1.5" />
                  )}
                  Upload image
                </Button>
                <p className="text-xs text-slate-400 mt-1.5">PNG or JPEG, up to 20MB</p>
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Identity
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="display_name">Display name</Label>
                <input
                  id="display_name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
                <p className="text-[11px] text-slate-400">
                  Changing this affects post matching. Prefer adding aliases for alternate spellings.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Tier</Label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primary</SelectItem>
                    <SelectItem value="secondary">Secondary</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Title / role</Label>
                <input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  placeholder="e.g. Chairman, Reliance"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="organization">Organization</Label>
                <input
                  id="organization"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">State / region</Label>
                <input
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="aliases">Aliases</Label>
                <input
                  id="aliases"
                  value={aliasesText}
                  onChange={(e) => setAliasesText(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  placeholder="Comma-separated alternate names"
                />
                <p className="text-[11px] text-slate-400">
                  Stored for matching. Merge-into-another-POI UI comes in a later iteration.
                </p>
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Summary
            </h2>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 resize-y min-h-[140px]"
              placeholder="Executive summary of recent activity and risk posture…"
            />
            <div className="space-y-1.5">
              <Label htmlFor="notes">Internal notes</Label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 resize-y"
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
