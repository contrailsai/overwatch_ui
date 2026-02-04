'use client'

import { useState, useEffect } from 'react'
import { getTakedowns } from './actions'
import Link from 'next/link'
import { 
  Filter, Search, ChevronRight, AlertTriangle, CheckCircle, 
  Clock, Mail, ArrowUpRight, ShieldAlert 
} from 'lucide-react'

export default function TakedownsPage() {
  const [takedowns, setTakedowns] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: 'all', platform: 'all' })

  useEffect(() => {
    async function load() {
      setLoading(true)
      const data = await getTakedowns(filters)
      setTakedowns(data)
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 py-6 px-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Takedown Requests</h1>
            <p className="text-sm text-gray-500 mt-1">Manage and track active content removal requests</p>
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors">
            <ShieldAlert className="w-4 h-4 mr-2" />
            New Manual Request
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex gap-4 items-center overflow-x-auto">
        <div className="flex items-center gap-2 text-gray-500 text-sm font-medium border-r border-gray-200 pr-4">
          <Filter className="w-4 h-4" />
          Filters
        </div>
        
        <select 
          value={filters.status}
          onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
          className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2"
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
          className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2"
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
              <div key={i} className="h-24 bg-white rounded-xl shadow-sm border border-gray-100 animate-pulse" />
            ))}
          </div>
        ) : takedowns.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200 border-dashed">
            <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No active takedowns found</h3>
            <p className="text-gray-500">Try adjusting your filters or start a new review.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {takedowns.map((item) => (
              <Link 
                key={item.id} 
                href={`/takedowns/case/${item.id}`}
                className="group block bg-white rounded-xl shadow-sm border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all duration-200"
              >
                <div className="p-6 flex items-center gap-6">
                  {/* Status Icon */}
                  <div className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                    item.status === 'accepted' ? 'bg-green-100' :
                    item.status === 'rejected' ? 'bg-red-100' :
                    item.status === 'suspended' ? 'bg-orange-100' :
                    'bg-indigo-50'
                  }`}>
                    {item.status === 'accepted' ? <CheckCircle className="w-6 h-6 text-green-600" /> :
                     item.status === 'rejected' ? <AlertTriangle className="w-6 h-6 text-red-600" /> :
                     item.status === 'suspended' ? <AlertTriangle className="w-6 h-6 text-orange-600" /> :
                     <Clock className="w-6 h-6 text-indigo-600" />}
                  </div>

                  {/* Main Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-lg font-bold text-gray-900 truncate">
                        Case #{item.post_platform_id.substring(0, 8)}...
                      </h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${getStatusColor(item.status)}`}>
                        {item.status?.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-gray-400 font-medium px-2 py-0.5 bg-gray-100 rounded border border-gray-200 uppercase">
                        {item.platform}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-6 text-sm text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                        Risk: <span className="font-bold text-gray-700">{item.risk_score}/100</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-gray-400" />
                        Type: <span className="font-medium text-gray-700 capitalize">{item.threat_type?.replace('_', ' ')}</span>
                      </span>
                      {item.last_update_date && (
                        <span className="text-gray-400">
                          Updated {new Date(item.last_update_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Latest Update Message */}
                  <div className="hidden md:block w-1/3 px-6 border-l border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">Latest Update</p>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {item.last_update_message || "No updates yet."}
                    </p>
                  </div>

                  {/* Arrow */}
                  <div className="text-gray-300 group-hover:text-indigo-600 transition-colors">
                    <ChevronRight className="w-6 h-6" />
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
