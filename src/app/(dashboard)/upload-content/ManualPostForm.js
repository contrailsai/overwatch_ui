'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { submitManualReviewerPost } from './manualPostActions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Plus, Trash2, FileText, CheckCircle2, AlertCircle } from 'lucide-react'

const MAX_MEDIA = 10

const emptyMediaRow = () => ({ original_url: '', type: 'image' })

export default function ManualPostForm({ moderationQueueConfigured = false }) {
  const [platform, setPlatform] = useState('youtube')
  const [id, setId] = useState('')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [authorUrl, setAuthorUrl] = useState('')
  const [likes, setLikes] = useState('0')
  const [views, setViews] = useState('0')
  const [comments, setComments] = useState('0')
  const [shares, setShares] = useState('0')
  const [takenAt, setTakenAt] = useState('')
  const [mediaRows, setMediaRows] = useState([emptyMediaRow()])
  const [queueAiAnalysis, setQueueAiAnalysis] = useState(moderationQueueConfigured)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const canAddMedia = mediaRows.length < MAX_MEDIA

  const payload = useMemo(
    () => ({
      platform: platform.trim(),
      id: id.trim(),
      content: content.trim(),
      url: url.trim(),
      authorName: authorName.trim(),
      authorUrl: authorUrl.trim(),
      likes,
      views,
      comments,
      shares,
      takenAt: takenAt.trim() === '' ? undefined : takenAt.trim(),
      mediaUrls: mediaRows
        .map((r) => ({
          original_url: r.original_url.trim(),
          type: (r.type || 'image').trim(),
        }))
        .filter((r) => r.original_url.length > 0),
      queueAiAnalysis: moderationQueueConfigured ? queueAiAnalysis : false,
    }),
    [
      platform,
      id,
      content,
      url,
      authorName,
      authorUrl,
      likes,
      views,
      comments,
      shares,
      takenAt,
      mediaRows,
      queueAiAnalysis,
      moderationQueueConfigured,
    ]
  )

  const addMediaRow = () => {
    if (!canAddMedia) return
    setMediaRows((prev) => [...prev, emptyMediaRow()])
  }

  const removeMediaRow = (index) => {
    setMediaRows((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length === 0 ? [emptyMediaRow()] : next
    })
  }

  const updateMediaRow = (index, field, value) => {
    setMediaRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setResult(null)
    try {
      const res = await submitManualReviewerPost(payload)
      setResult(res)
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : 'Something went wrong' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="space-y-6">
      <Card className="border-slate-200 shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden p-0 bg-white">
        <CardHeader className="bg-white border-b border-slate-100 p-5 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-600/10 flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-slate-900 tracking-tight">Manual post</CardTitle>
              <CardDescription className="text-slate-500 text-sm font-medium">
                Add a single post directly to the project database (reviewer only). Media URLs are mirrored to S3 when
                possible; embeddings and clustering run via the embedding service after save.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="p-4 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mp-platform">Platform</Label>
                <Input
                  id="mp-platform"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  placeholder="youtube"
                  className="rounded-xl"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mp-id">Post id</Label>
                <Input
                  id="mp-id"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  placeholder="yt_video_123"
                  className="rounded-xl"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mp-url">URL</Label>
              <Input
                id="mp-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=123"
                className="rounded-xl"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mp-content">Content</Label>
              <Textarea
                id="mp-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Description or post text"
                className="min-h-[120px] rounded-xl"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mp-author-name">Author name</Label>
                <Input
                  id="mp-author-name"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Channel Name"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mp-author-url">Author URL</Label>
                <Input
                  id="mp-author-url"
                  type="url"
                  value={authorUrl}
                  onChange={(e) => setAuthorUrl(e.target.value)}
                  placeholder="https://youtube.com/c/ChannelName"
                  className="rounded-xl"
                />
              </div>
            </div>

            <div>
              <p className="text-sm font-bold text-slate-700 mb-3">Engagement</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mp-likes">Likes</Label>
                  <Input
                    id="mp-likes"
                    inputMode="numeric"
                    value={likes}
                    onChange={(e) => setLikes(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mp-views">Views</Label>
                  <Input
                    id="mp-views"
                    inputMode="numeric"
                    value={views}
                    onChange={(e) => setViews(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mp-comments">Comments</Label>
                  <Input
                    id="mp-comments"
                    inputMode="numeric"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mp-shares">Shares</Label>
                  <Input
                    id="mp-shares"
                    inputMode="numeric"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mp-taken-at">Taken at (optional)</Label>
              <Input
                id="mp-taken-at"
                value={takenAt}
                onChange={(e) => setTakenAt(e.target.value)}
                placeholder="Unix seconds, e.g. 1731234567, or ISO date"
                className="rounded-xl"
              />
              <p className="text-xs text-slate-500">If empty, the current time is used.</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-bold text-slate-700">Media URLs</Label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addMediaRow}
                  disabled={!canAddMedia}
                  className="rounded-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add row
                </Button>
              </div>
              {mediaRows.map((row, index) => (
                <div key={index} className="flex flex-col sm:flex-row gap-2 sm:items-end">
                  <div className="flex-1 space-y-2">
                    <Label className="text-xs text-slate-500 sr-only">Original URL {index + 1}</Label>
                    <Input
                      value={row.original_url}
                      onChange={(e) => updateMediaRow(index, 'original_url', e.target.value)}
                      placeholder="https://…"
                      type="url"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="w-full sm:w-32 space-y-2">
                    <Label className="text-xs text-slate-500 sr-only">Type</Label>
                    <Input
                      value={row.type}
                      onChange={(e) => updateMediaRow(index, 'type', e.target.value)}
                      placeholder="image"
                      className="rounded-xl"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMediaRow(index)}
                    disabled={mediaRows.length === 1}
                    className="shrink-0 text-rose-600 cursor-pointer"
                    aria-label="Remove media row"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-slate-500">Up to {MAX_MEDIA} items. Empty rows are ignored on submit.</p>
            </div>

            {moderationQueueConfigured && (
              <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                <Checkbox
                  id="mp-queue-ai"
                  checked={queueAiAnalysis}
                  onCheckedChange={(v) => setQueueAiAnalysis(v === true)}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="mp-queue-ai" className="text-sm font-semibold text-slate-800 cursor-pointer">
                    Queue AI content moderation
                  </Label>
                  <p className="text-xs text-slate-500 mt-1">
                    Sends the new post to the moderation pipeline after embeddings are requested.
                  </p>
                </div>
              </div>
            )}

            {result?.error && (
              <div className="flex items-center gap-3 p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-100">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-sm font-bold">{result.error}</p>
              </div>
            )}

            {result?.success && (
              <div className="space-y-3 p-4 bg-emerald-50 text-emerald-900 rounded-xl border border-emerald-100">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                  <p className="text-sm font-bold">{result.message}</p>
                </div>
                <p className="text-xs font-mono text-emerald-800/90 pl-8">Mongo _id: {result.insertedId}</p>
                <p className="text-sm pl-8">
                  <Link href="/review-cases" className="font-bold text-emerald-800 underline hover:text-emerald-950">
                    Open review cases
                  </Link>
                </p>
                {result.warnings?.length > 0 && (
                  <div className="pl-8 pt-2 space-y-2 border-t border-emerald-200/60 mt-2">
                    {result.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-800 font-medium flex gap-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>

          <CardFooter className="bg-slate-50/50 border-t border-slate-100 p-4 sm:p-6 flex flex-col sm:flex-row justify-end px-4 sm:px-8 gap-4">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto cursor-pointer bg-violet-600 hover:bg-violet-700 text-white font-bold px-8 h-12 rounded-xl"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                'Create post'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </section>
  )
}
