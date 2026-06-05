'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Download, FileText, Calendar as CalendarIcon, Clock, Filter, X, Loader2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DateFilterPopover } from '@/components/DateFilterPopover'
import SafeDate from '@/components/SafeDate'
import { cn } from '@/lib/utils'
import { getReportDownloadUrlAction } from './actions'

function getStatusColor(status) {
  if (!status) return 'bg-slate-100 text-slate-800'
  const lowerStatus = status.toLowerCase()
  if (lowerStatus.includes('complete') || lowerStatus.includes('100%')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-100'
  }
  if (lowerStatus.includes('error') || lowerStatus.includes('failed')) {
    return 'bg-rose-50 text-rose-700 border-rose-100'
  }
  return 'bg-blue-50 text-blue-700 border-blue-100'
}

function ReportDownloadButton({ report, downloadingId, onDownload }) {
  if (!report.s3_path) {
    return <span className="text-xs text-slate-400 italic">No file available</span>
  }

  const isLoading = downloadingId === report.id

  return (
    <Button
      onClick={() => onDownload(report)}
      variant="outline"
      size="sm"
      disabled={isLoading}
      className={cn(
        'bg-white border-slate-200 hover:bg-slate-50 hover:text-blue-600 transition-all touch-manipulation',
        'min-h-11 w-full sm:min-h-9 sm:w-auto'
      )}
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" />
      ) : (
        <Download className="mr-2 h-4 w-4 shrink-0" />
      )}
      {isLoading ? 'Signing...' : 'Download'}
    </Button>
  )
}

function ReportMeta({ report }) {
  return (
    <div className="flex flex-col text-sm text-slate-600">
      <div className="flex items-center gap-1.5 font-medium text-slate-900">
        <CalendarIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <SafeDate date={report.last_update} formatStr="MMM dd, yyyy" />
      </div>
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <SafeDate date={report.last_update} formatStr="hh:mm a" />
      </div>
    </div>
  )
}

function ReportIdentity({ report }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
        <FileText className="h-5 w-5" />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="font-medium text-slate-900 truncate">
          {report.report_type || 'General Report'}
        </span>
        {report.report_hash && (
          <span className="text-xs text-slate-500 font-mono truncate" title={report.report_hash}>
            {report.report_hash.substring(0, 12)}…
          </span>
        )}
      </div>
    </div>
  )
}

function ReportsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-slate-500 py-12 px-4">
      <FileText className="h-10 w-10 mb-2 opacity-20" />
      <p className="text-base font-medium text-center">No reports found</p>
      <p className="text-sm opacity-70 text-center max-w-xs mt-1">
        Try adjusting your filters or check back later.
      </p>
    </div>
  )
}

function ReportMobileCard({ report, downloadingId, onDownload }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm overflow-hidden p-0">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <ReportIdentity report={report} />
          </div>
          <Badge
            className={cn(
              'px-2.5 py-0.5 rounded-full font-medium border shrink-0 text-[11px]',
              getStatusColor(report.status)
            )}
          >
            {report.status || 'Unknown'}
          </Badge>
        </div>
        <div className="pt-3 border-t border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
            Created
          </p>
          <ReportMeta report={report} />
        </div>
      </div>
      <div className="px-4 pb-4 pt-0">
        <ReportDownloadButton
          report={report}
          downloadingId={downloadingId}
          onDownload={onDownload}
        />
      </div>
    </Card>
  )
}

export function ReportsList({ reports, initialFilters }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [downloadingId, setDownloadingId] = useState(null)

  const [dateRange, setDateRange] = useState({
    from: initialFilters.from ? new Date(initialFilters.from) : undefined,
    to: initialFilters.to ? new Date(initialFilters.to) : undefined,
  })

  const [reportType, setReportType] = useState(initialFilters.report_type || 'all')

  const hasActiveFilters =
    Boolean(dateRange?.from || dateRange?.to) || reportType !== 'all'

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())

    if (dateRange?.from) {
      params.set('from', dateRange.from.toISOString())
    } else {
      params.delete('from')
    }

    if (dateRange?.to) {
      params.set('to', dateRange.to.toISOString())
    } else {
      params.delete('to')
    }

    if (reportType && reportType !== 'all') {
      params.set('report_type', reportType)
    } else {
      params.delete('report_type')
    }

    const newQuery = params.toString()
    const currentQuery = searchParams.toString()

    if (newQuery !== currentQuery) {
      router.push(`?${newQuery}`)
    }
  }, [dateRange, reportType, router, searchParams])

  const clearFilters = () => {
    setDateRange({ from: undefined, to: undefined })
    setReportType('all')
  }

  const handleDownload = async (report) => {
    if (!report.s3_path) return

    try {
      setDownloadingId(report.id)
      const signedUrl = await getReportDownloadUrlAction(
        report.id,
        report.report_type,
        report.last_update
      )
      if (signedUrl) {
        window.open(signedUrl, '_blank')
      } else {
        alert('Could not generate download link. Please try again.')
      }
    } catch (error) {
      console.error('Download error:', error)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6 px-4 py-4 sm:p-6 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      {/* Filters */}
      <Card className="border-slate-200 shadow-sm p-4 sm:p-0 sm:border-0 sm:shadow-none sm:bg-transparent">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              <Filter className="h-3.5 w-3.5 shrink-0" />
              Filter by
            </span>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 px-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors gap-1.5 touch-manipulation shrink-0"
              >
                <X className="h-4 w-4" />
                <span className="text-[10px] uppercase font-bold">Clear</span>
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <div className="w-full sm:w-auto bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-full sm:w-[140px] border-none shadow-none focus:ring-0 min-h-11 sm:h-9 text-xs font-medium touch-manipulation">
                  <SelectValue placeholder="Report Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Summary">Summary</SelectItem>
                  <SelectItem value="Detailed">Detailed</SelectItem>
                  <SelectItem value="Profile">Profile</SelectItem>
                  <SelectItem value="SimpleProfile">Simple Profile</SelectItem>
                  <SelectItem value="Single">Single</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-auto sm:min-w-[200px] bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
              <DateFilterPopover
                title="Creation Date"
                initialFrom={dateRange.from}
                initialTo={dateRange.to}
                onApply={(range) => setDateRange(range)}
              />
            </div>
          </div>
        </div>
      </Card>

      {reports.length > 0 && (
        <p className="text-xs text-slate-500 -mt-1 sm:mt-0">
          <span className="font-semibold text-slate-700">{reports.length}</span>
          {reports.length === 1 ? ' report' : ' reports'}
        </p>
      )}

      {/* Mobile: cards */}
      <div className="md:hidden">
        {reports.length === 0 ? (
          <Card className="border-slate-200 shadow-sm">
            <ReportsEmptyState />
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {reports.map((report) => (
              <li key={report.id}>
                <ReportMobileCard
                  report={report}
                  downloadingId={downloadingId}
                  onDownload={handleDownload}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Desktop: table */}
      <Card className="hidden md:block border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow>
                <TableHead className="w-[350px]">Report Details</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <ReportsEmptyState />
                  </TableCell>
                </TableRow>
              ) : (
                reports.map((report) => (
                  <TableRow
                    key={report.id}
                    className="hover:bg-slate-50/50 transition-colors group"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3 group-hover:[&_.icon-wrap]:bg-blue-100">
                        <div className="icon-wrap p-2 rounded-lg bg-blue-50 text-blue-600 transition-colors shrink-0">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-slate-900">
                            {report.report_type || 'General Report'}
                          </span>
                          <span
                            className="text-xs text-slate-500 font-mono truncate max-w-[200px]"
                            title={report.report_hash}
                          >
                            {report.report_hash?.substring(0, 12)}…
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ReportMeta report={report} />
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          'px-2.5 py-0.5 rounded-full font-medium border',
                          getStatusColor(report.status)
                        )}
                      >
                        {report.status || 'Unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <ReportDownloadButton
                        report={report}
                        downloadingId={downloadingId}
                        onDownload={handleDownload}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
