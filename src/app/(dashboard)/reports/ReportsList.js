'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { Download, FileText, Calendar as CalendarIcon, Clock, Filter, X } from 'lucide-react'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
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
} from "@/components/ui/select"
import { DateFilterPopover } from '@/components/DateFilterPopover'
import SafeDate from '@/components/SafeDate'
import { cn } from '@/lib/utils'
import { getReportDownloadUrlAction } from './actions'

export function ReportsList({ reports, initialFilters }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [downloadingId, setDownloadingId] = useState(null)
  
  const [dateRange, setDateRange] = useState({
    from: initialFilters.from ? new Date(initialFilters.from) : undefined,
    to: initialFilters.to ? new Date(initialFilters.to) : undefined
  })

  const [reportType, setReportType] = useState(initialFilters.report_type || 'all')

  // Update URL when filters change
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
      const signedUrl = await getReportDownloadUrlAction(report.id, report.report_type, report.last_update)
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

  const getStatusColor = (status) => {
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

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      {/* Filters Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-start gap-6">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Filter by</span>
          
          <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
             <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-[140px] border-none shadow-none focus:ring-0 h-9 text-xs font-medium">
                  <SelectValue placeholder="Report Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Summary">Summary</SelectItem>
                  <SelectItem value="Detailed">Detailed</SelectItem>
                  <SelectItem value="Profile">Profile</SelectItem>
                  <SelectItem value="Single">Single</SelectItem>
                </SelectContent>
             </Select>
          </div>

          <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm min-w-[200px]">
            <DateFilterPopover 
              title="Creation Date"
              initialFrom={dateRange.from}
              initialTo={dateRange.to}
              onApply={(range) => setDateRange(range)}
            />
          </div>

          {(dateRange?.from || dateRange?.to || reportType !== 'all') && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearFilters}
              className="h-9 px-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors gap-2"
            >
              <X className="h-4 w-4" />
              <span className="text-[10px] uppercase font-bold">Clear</span>
            </Button>
          )}
        </div>
      </div>

      {/* Table Content */}
      <Card className="border-slate-200 overflow-hidden shadow-sm">
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
                <TableCell colSpan={4} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-500">
                    <FileText className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-base font-medium">No reports found</p>
                    <p className="text-sm opacity-70">Try adjusting your date filters or check back later.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              reports.map((report) => (
                <TableRow key={report.id} className="hover:bg-slate-50/50 transition-colors group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900">{report.report_type || 'General Report'}</span>
                        <span className="text-xs text-slate-500 font-mono truncate max-w-[200px]">
                          {report.report_hash?.substring(0, 12)}...
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-sm text-slate-600">
                      <div className="flex items-center gap-1.5 font-medium text-slate-900">
                        <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
                        <SafeDate date={report.last_update} formatStr="MMM dd, yyyy" />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                        <Clock className="h-3.5 w-3.5" />
                        <SafeDate date={report.last_update} formatStr="hh:mm a" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("px-2.5 py-0.5 rounded-full font-medium border", getStatusColor(report.status))}>
                      {report.status || 'Unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {report.s3_path ? (
                      <Button 
                        onClick={() => handleDownload(report)}
                        variant="outline" 
                        size="sm" 
                        disabled={downloadingId === report.id}
                        className="bg-white border-slate-200 hover:bg-slate-50 hover:text-blue-600 h-9 transition-all"
                      >
                        <Download className={cn("mr-2 h-4 w-4", downloadingId === report.id && "animate-bounce")} />
                        {downloadingId === report.id ? 'Signing...' : 'Download'}
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No file available</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
