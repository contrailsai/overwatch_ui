'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import { submitManualReviewerPost } from './manualPostActions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  Loader2,
  Plus,
  Trash2,
  FileText,
  CheckCircle2,
  AlertCircle,
  CalendarIcon,
  ImagePlus,
  Upload,
} from 'lucide-react'

const MAX_MEDIA = 10

function newMediaSlot() {
  return { key: typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Math.random()), file: null, previewUrl: null }
}

function buildTakenAtIso(date, timeStr) {
  if (!date) return undefined
  const d = new Date(date)
  const raw = (timeStr || '12:00').trim()
  const [hs, ms] = raw.split(':')
  const h = Math.min(23, Math.max(0, parseInt(hs, 10) || 0))
  const m = Math.min(59, Math.max(0, parseInt(ms, 10) || 0))
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

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
  const [takenAtDate, setTakenAtDate] = useState(undefined)
  const [takenAtTime, setTakenAtTime] = useState('12:00')
  const [takenCalendarOpen, setTakenCalendarOpen] = useState(false)
  const [mediaSlots, setMediaSlots] = useState(() => [newMediaSlot()])
  const [queueAiAnalysis, setQueueAiAnalysis] = useState(moderationQueueConfigured)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const fileCount = mediaSlots.filter((s) => s.file).length
  const canAddMedia = mediaSlots.length < MAX_MEDIA

  const revokePreview = useCallback((previewUrl) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [])

  const previewUrlsRef = useRef([])
  useEffect(() => {
    previewUrlsRef.current = mediaSlots.map((s) => s.previewUrl).filter(Boolean)
  }, [mediaSlots])
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  const addMediaSlot = () => {
    if (!canAddMedia) return
    setMediaSlots((prev) => [...prev, newMediaSlot()])
  }

  const removeMediaSlot = (index) => {
    setMediaSlots((prev) => {
      const row = prev[index]
      if (row?.previewUrl) revokePreview(row.previewUrl)
      const next = prev.filter((_, i) => i !== index)
      return next.length === 0 ? [newMediaSlot()] : next
    })
  }

  const setFileAtIndex = (index, file) => {
    setMediaSlots((prev) => {
      const next = [...prev]
      const cur = next[index]
      if (cur?.previewUrl) revokePreview(cur.previewUrl)
      if (!file || !file.type.startsWith('image/')) {
        next[index] = { ...cur, file: null, previewUrl: null }
      } else {
        next[index] = { ...cur, file, previewUrl: URL.createObjectURL(file) }
      }
      return next
    })
  }

  const clearEntireForm = () => {
    for (const s of mediaSlots) {
      if (s.previewUrl) revokePreview(s.previewUrl)
    }
    setPlatform('youtube')
    setId('')
    setContent('')
    setUrl('')
    setAuthorName('')
    setAuthorUrl('')
    setLikes('0')
    setViews('0')
    setComments('0')
    setShares('0')
    setTakenAtDate(undefined)
    setTakenAtTime('12:00')
    setTakenCalendarOpen(false)
    setMediaSlots([newMediaSlot()])
    setQueueAiAnalysis(moderationQueueConfigured)
    setResult(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setResult(null)
    try {
      const files = mediaSlots.map((s) => s.file).filter(Boolean)
      const takenAtIso = buildTakenAtIso(takenAtDate, takenAtTime)

      const payloadObj = {
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
        takenAt: takenAtIso,
        mediaUrls: [],
        queueAiAnalysis: moderationQueueConfigured ? queueAiAnalysis : false,
      }

      const fd = new FormData()
      fd.append('payload', JSON.stringify(payloadObj))
      files.forEach((f, i) => {
        fd.append(`media_${i}`, f)
      })

      const res = await submitManualReviewerPost(fd)
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
            <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-slate-900 tracking-tight">Manual post</CardTitle>
              <CardDescription className="text-slate-500 text-sm font-medium">
                Add a single post directly to the project database (reviewer only). Images upload to S3 on save;
                embeddings and clustering run via the embedding service after save.
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
              <Label>Publishing date-time (optional)</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <Popover open={takenCalendarOpen} onOpenChange={setTakenCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal rounded-xl border-slate-200 bg-white hover:bg-slate-50 h-11 pr-10',
                          !takenAtDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 text-blue-600 shrink-0" />
                        {takenAtDate ? format(takenAtDate, 'PPP') : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={takenAtDate}
                        onSelect={(d) => {
                          setTakenAtDate(d)
                          setTakenCalendarOpen(false)
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {takenAtDate ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 px-2 text-xs text-slate-500 hover:text-blue-600"
                      onClick={() => setTakenAtDate(undefined)}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mp-publishing-time" className="text-xs text-slate-500">
                    Time
                  </Label>
                  <Input
                    id="mp-publishing-time"
                    type="time"
                    value={takenAtTime}
                    onChange={(e) => setTakenAtTime(e.target.value)}
                    className="rounded-xl h-11"
                    disabled={!takenAtDate}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                If you leave the date empty, the current time is used as the publishing time when the post is saved.
                Time uses your local timezone.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <ImagePlus className="w-4 h-4 text-blue-600" />
                  Images
                </Label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addMediaSlot}
                  disabled={!canAddMedia}
                  className="rounded-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add slot
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {mediaSlots.map((slot, index) => (
                  <div
                    key={slot.key}
                    className="relative rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden flex flex-col min-h-[160px]"
                  >
                    {slot.file && slot.previewUrl ? (
                      <div className="relative flex-1 min-h-[140px] bg-slate-900/5 flex items-center justify-center p-2">
                        <Image
                          src={slot.previewUrl}
                          alt=""
                          width={800}
                          height={600}
                          unoptimized
                          className="max-h-[220px] w-auto h-auto object-contain"
                        />
                        <p className="text-[10px] text-slate-500 truncate px-2 py-1 border-t border-slate-100 bg-white/90">
                          {slot.file.name}
                        </p>
                      </div>
                    ) : (
                      <label
                        className="flex-1 flex flex-col items-center justify-center gap-2 p-6 cursor-pointer hover:bg-blue-50/40 transition-colors min-h-[140px]"
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const f = e.dataTransfer.files?.[0]
                          if (f?.type.startsWith('image/')) setFileAtIndex(index, f)
                        }}
                      >
                        <Upload className="w-8 h-8 text-blue-600/70" />
                        <span className="text-sm font-medium text-slate-600">Drop an image or click to choose</span>
                        <span className="text-xs text-slate-400">JPEG, PNG, WebP, GIF — max 10MB</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) setFileAtIndex(index, f)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    )}

                    {slot.file ? (
                      <div className="flex items-center gap-2 p-2 border-t border-slate-100 bg-white">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-lg text-xs h-9"
                          onClick={() => {
                            const input = document.createElement('input')
                            input.type = 'file'
                            input.accept = 'image/*'
                            input.onchange = () => {
                              const f = input.files?.[0]
                              if (f) setFileAtIndex(index, f)
                            }
                            input.click()
                          }}
                        >
                          Replace
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMediaSlot(index)}
                          disabled={mediaSlots.length === 1 && !slot.file}
                          className="shrink-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                          aria-label="Remove image slot"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end p-2 border-t border-slate-100 bg-white">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMediaSlot(index)}
                          disabled={mediaSlots.length === 1}
                          className="shrink-0 text-slate-400 hover:text-rose-600 cursor-pointer"
                          aria-label="Remove slot"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Up to {MAX_MEDIA} images. {fileCount > 0 ? `${fileCount} selected — uploaded to S3 when you create the post.` : 'Optional.'}
              </p>
            </div>

            {moderationQueueConfigured && (
              <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                <Checkbox
                  id="mp-queue-ai"
                  checked={queueAiAnalysis}
                  onCheckedChange={(v) => setQueueAiAnalysis(v === true)}
                  className="mt-0.5 border-blue-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
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
                <div className="pl-8 flex flex-col sm:flex-row sm:items-center gap-3">
                  <Link href="/review-cases" className="font-bold text-blue-600 underline hover:text-blue-800 text-sm">
                    Open review cases
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearEntireForm}
                    className="w-full sm:w-auto rounded-lg border-emerald-200 text-emerald-900 hover:bg-emerald-100/80 cursor-pointer"
                  >
                    Clear form
                  </Button>
                </div>
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
              className="w-full sm:w-auto cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 h-12 rounded-xl shadow-lg shadow-blue-600/20"
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
