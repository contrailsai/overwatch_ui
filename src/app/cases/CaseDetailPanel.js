'use client'

import { X, User, Heart, MessageCircle, Share2, Shield, AlertTriangle, FileText, Activity, ChevronDown, ChevronUp, BadgeCheck, Quote } from 'lucide-react'
import { useState } from 'react'

const SectionHeader = ({ title, icon: Icon, id, expandedSection, onToggle }) => (
  <button
    onClick={() => onToggle(id)}
    className="flex items-center justify-between w-full px-6 py-4 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100"
  >
    <div className="flex items-center space-x-2 text-gray-700 font-medium">
      <Icon className="w-4 h-4" />
      <span>{title}</span>
    </div>
    {expandedSection === id ? (
      <ChevronUp className="w-4 h-4 text-gray-400" />
    ) : (
      <ChevronDown className="w-4 h-4 text-gray-400" />
    )}
  </button>
)

export function CaseDetailPanel({ post, onClose, isOpen }) {
  const [expandedSection, setExpandedSection] = useState('review')

  if (!isOpen || !post) return null

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl overflow-y-auto flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Case Details</h2>
            <p className="text-sm text-gray-500">ID: {post._id}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1">
          {/* Main Media & Caption */}
          <div className="p-6 border-b border-gray-200">
             <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                {post.user.profile_pic_url ? (
                  <img src={post.user.profile_pic_url} alt={post.user.username} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div>
                <h3 className="font-medium text-gray-900 flex items-center">
                  {post.user.username}
                  {post.user.is_verified && (
                     <BadgeCheck className="ml-1 w-4 h-4 text-blue-500 fill-blue-50" />
                  )}
                </h3>
                <span className="text-sm text-gray-500 capitalize">{post.platform} • {post.created_at ? new Date(post.created_at).toLocaleDateString() : 'N/A'}</span>
              </div>
            </div>

            {post.signedImageUrl ? (
              <>
                <div className="rounded-lg overflow-hidden bg-gray-100 border border-gray-200 mb-4 flex items-center justify-center min-h-[300px] max-h-[500px]">
                  <img 
                    src={post.signedImageUrl} 
                    alt="Post content" 
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
                  {post.caption}
                </p>
              </>
            ) : (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-8 mb-4 flex flex-col justify-center min-h-[240px] relative overflow-hidden">
                <Quote className="absolute top-4 left-4 w-8 h-8 text-gray-300 opacity-50" />
                <div className="relative z-10">
                   {post.caption ? (
                      <p className="text-gray-900 text-xl font-medium leading-relaxed whitespace-pre-wrap text-center font-serif">
                        &quot;{post.caption}&quot;
                      </p>
                   ) : (
                      <div className="text-gray-400 flex flex-col items-center">
                        <AlertTriangle className="w-8 h-8 mb-2" />
                        <span className="text-sm">No Content Available</span>
                      </div>
                   )}
                </div>
                <Quote className="absolute bottom-4 right-4 w-8 h-8 text-gray-300 opacity-50 transform rotate-180" />
              </div>
            )}

            <div className="flex items-center space-x-6 mt-6 pt-6 border-t border-gray-100 text-gray-500 text-sm">
              <div className="flex items-center space-x-2 bg-gray-50 px-3 py-1.5 rounded-full">
                <Heart className="w-4 h-4 text-pink-500" />
                <span className="font-medium text-gray-700">{post.stats.like_count.toLocaleString()}</span>
                <span className="text-xs text-gray-400">likes</span>
              </div>
              <div className="flex items-center space-x-2 bg-gray-50 px-3 py-1.5 rounded-full">
                <MessageCircle className="w-4 h-4 text-blue-500" />
                <span className="font-medium text-gray-700">{post.stats.comment_count.toLocaleString()}</span>
                <span className="text-xs text-gray-400">comments</span>
              </div>
              <div className="flex items-center space-x-2 bg-gray-50 px-3 py-1.5 rounded-full">
                <Share2 className="w-4 h-4 text-green-500" />
                <span className="font-medium text-gray-700">{post.stats.share_count.toLocaleString()}</span>
                <span className="text-xs text-gray-400">shares</span>
              </div>
            </div>
          </div>

          {/* Collapsible Sections */}
          <div className="border-b border-gray-200">
            <SectionHeader title="Review Status" icon={Shield} id="review" expandedSection={expandedSection} onToggle={toggleSection} />
            {expandedSection === 'review' && (
              <div className="p-6 bg-white animate-in slide-in-from-top-2 duration-200">
                {post.review_details ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="text-xs text-gray-500 uppercase tracking-wide font-bold">Status</div>
                        <div className="mt-1 font-medium text-gray-900 capitalize flex items-center">
                          <span className={`w-2 h-2 rounded-full mr-2 ${post.processed ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                          {post.processed ? 'Reviewed' : 'Pending'}
                        </div>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                         <div className="text-xs text-gray-500 uppercase tracking-wide font-bold">Risk Score</div>
                         <div className={`mt-1 font-bold text-lg ${
                             (post.review_details.threat_score || 0) > 70 ? 'text-red-600' : 
                             (post.review_details.threat_score || 0) > 40 ? 'text-orange-600' : 'text-green-600'
                         }`}>
                             {post.review_details.threat_score || 0}<span className="text-sm text-gray-400 font-normal">/100</span>
                         </div>
                      </div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide font-bold mb-2">Threat Category</div>
                        <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-50 text-red-700 border border-red-100 capitalize">
                            {post.review_details.threat_type?.replace('_', ' ') || 'None'}
                        </div>
                    </div>
                     <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide font-bold mb-1">Takedown Status</div>
                         <div className="text-sm text-gray-700 font-medium">
                            {post.takedown_info?.takedown_status || 'Not initiated'}
                         </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No review has been performed yet.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-b border-gray-200">
            <SectionHeader title="Automated Analysis" icon={Activity} id="analysis" expandedSection={expandedSection} onToggle={toggleSection} />
             {expandedSection === 'analysis' && (
              <div className="p-6 bg-white animate-in slide-in-from-top-2 duration-200">
                 {post.analysis_results ? (
                     <div className="space-y-3">
                         <pre className="text-xs bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto font-mono custom-scrollbar">
                             {JSON.stringify(post.analysis_results, null, 2)}
                         </pre>
                     </div>
                 ) : (
                     <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No automated analysis data available.</p>
                     </div>
                 )}
              </div>
            )}
          </div>

          <div className="border-b border-gray-200">
             <SectionHeader title="Raw Data" icon={FileText} id="raw" expandedSection={expandedSection} onToggle={toggleSection} />
             {expandedSection === 'raw' && (
              <div className="p-6 bg-white animate-in slide-in-from-top-2 duration-200">
                 <pre className="text-xs bg-gray-50 text-gray-600 p-4 rounded-lg overflow-x-auto border border-gray-200 font-mono custom-scrollbar">
                     {JSON.stringify({ ...post, signedImageUrl: '...' }, null, 2)}
                 </pre>
              </div>
            )}
          </div>

        </div>

         {/* Footer Actions */}
         <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 flex justify-end space-x-3">
             <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:text-gray-900 transition-colors">
                 Close
             </button>
             <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 shadow-sm transition-colors">
                 Open in Review Tool
             </button>
         </div>

      </div>
    </div>
  )
}
