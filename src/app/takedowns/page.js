'use client'

import { useState, useEffect } from 'react'
import { getTakedowns, checkReviewerPermission } from './actions'
import Link from 'next/link'
import {
  Filter, Search, ChevronRight, AlertTriangle, CheckCircle,
  Clock, Mail, ArrowUpRight, ShieldAlert, User, ImageIcon
} from 'lucide-react'
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export default function TakedownsPage() {
  const [takedowns, setTakedowns] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: 'all', platform: 'all' })
  const [isReviewer, setIsReviewer] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [data, permission] = await Promise.all([
        getTakedowns(filters),
        checkReviewerPermission()
      ])
      setTakedowns(data)
      setIsReviewer(permission)
      setLoading(false)
    }
    load()
  }, [filters])

  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted': return 'bg-green-100 text-green-800 border-green-200'
      case 'rejected': return 'bg-red-100 text-red-800 border-red-200'
      case 'under_review': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'suspended': return 'bg-orange-100 text-orange-800 border-orange-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-gray-50/50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 py-6 px-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Takedown Requests</h1>
            <p className="text-sm text-gray-500 mt-1">Manage and track active content removal requests</p>
          </div>

        </div>
      </header>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex gap-4 items-center overflow-x-auto sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2 text-gray-500 text-sm font-medium border-r border-gray-200 pr-4 shrink-0">
          <Filter className="w-4 h-4" />
          Filters
        </div>

        <select
          value={filters.status}
          onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
          className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 cursor-pointer hover:bg-gray-100 transition-colors"
        >
          <option value="all">All Statuses</option>
          <option value="raised">Raised</option>
          <option value="under_review">Under Review</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </select>

        <select
          value={filters.platform}
          onChange={(e) => setFilters(prev => ({ ...prev, platform: e.target.value }))}
          className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 cursor-pointer hover:bg-gray-100 transition-colors"
        >
          <option value="all">All Platforms</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="x">X (Twitter)</option>
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-white rounded-xl shadow-sm border border-gray-100 animate-pulse" />
            ))}
          </div>
        ) : takedowns.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200 border-dashed">
            <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No active takedowns found</h3>
            <p className="text-gray-500">Try adjusting your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {takedowns.map((item) => (
              <Link
                key={item.id}
                href={`/takedowns/case/${item.id}`}
                className="group block bg-white rounded-xl shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                <div className="flex h-full">

                  {/* Thumbnail / Left Accent */}
                  <div className="w-32 bg-gray-100 shrink-0 relative overflow-hidden flex items-center justify-center border-r border-gray-100">
                    {item.enrichment?.thumbnail ? (
                      <img
                        src={item.enrichment.thumbnail}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        alt="Evidence"
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-300" />
                    )}

                    {/* Platform Icon Overlay */}
                    <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm p-1.5 rounded-md shadow-sm">
                      {/* You could add platform icons here, for now using text/color */}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-700">
                        {item.platform?.slice(0, 2)}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 p-5 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-gray-900 truncate leading-tight group-hover:text-blue-600 transition-colors">
                            {item.enrichment?.username ? `@${item.enrichment.username}` : `Case #${item.post_platform_id.substring(0, 8)}`}
                          </h3>
                          <p className="text-sm text-gray-500 truncate mt-1">
                            {item.enrichment?.caption || `ID: ${item.post_platform_id}`}
                          </p>
                        </div>
                        <div className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${getStatusColor(item.status)}`}>
                          {item.status?.replace('_', ' ')}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-sm text-gray-500 mt-3 pt-3 border-t border-gray-50">
                      <span className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${item.risk_score > 80 ? 'bg-red-500' : 'bg-orange-400'}`} />
                        Risk: <span className="font-bold text-gray-700">{item.risk_score}/100</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-gray-400" />
                        <span className="font-medium text-gray-700 capitalize">{item.threat_type?.replace('_', ' ')}</span>
                      </span>
                      {item.last_update_date && (
                        <span className="text-gray-400 flex items-center gap-1.5 ml-auto">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(item.last_update_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Action Area */}
                  <div className="w-12 border-l border-gray-100 flex items-center justify-center bg-gray-50/50 group-hover:bg-blue-50/50 transition-colors">
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-600" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
