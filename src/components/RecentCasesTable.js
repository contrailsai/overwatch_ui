'use client'

import { AlertTriangle, Clock, Image as ImageIcon, ArrowRight, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export function RecentCasesTable({ cases }) {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead>
            <tr className="bg-slate-50/50">
              <th scope="col" className="px-8 py-5 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">
                Evidence
              </th>
              <th scope="col" className="px-6 py-5 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">
                Platform
              </th>
              <th scope="col" className="px-6 py-5 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">
                Source
              </th>
              <th scope="col" className="px-6 py-5 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">
                Content
              </th>
              <th scope="col" className="px-6 py-5 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">
                Post Date
              </th>
              {/* <th scope="col" className="px-6 py-5 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">
                Risk Profile
              </th> */}
              <th scope="col" className="px-8 py-5 text-right text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                Review Case
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {cases.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-8 py-20 text-center text-sm text-slate-400">
                  <div className="flex flex-col items-center justify-center">
                    <Clock className="h-12 w-12 mb-4 text-slate-200" />
                    <p className="font-bold text-slate-900 mb-1">No Active Threats</p>
                    <p className="font-medium">Recent intelligence data will appear here.</p>
                  </div>
                </td>
              </tr>
            ) : (
              cases.map((caseItem) => (
                <tr key={caseItem._id} className="group hover:bg-slate-50/50 transition-all duration-200">
                  <td className="px-8 py-5 whitespace-nowrap">
                    <div className="h-14 w-14 rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center border-2 border-slate-50 transition-transform group-hover:scale-105">
                      {caseItem.signedImageUrl ? (
                        <img
                          src={caseItem.signedImageUrl}
                          alt="Post preview"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-slate-300" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap">
                    <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tighter border ${caseItem.platform === 'facebook' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                      caseItem.platform === 'x' ? 'bg-slate-900 text-white border-slate-900' :
                        'bg-pink-50 text-pink-700 border-pink-100'
                      }`}>
                      {caseItem.platform}
                    </span>
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900">{caseItem.username}</span>
                      <span className="text-[10px] font-medium text-slate-400">Verified ID</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-sm text-slate-600 max-w-xs xl:max-w-md">
                    <p className="line-clamp-2 leading-relaxed font-medium">{caseItem.caption || 'No caption'}</p>
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm font-bold text-slate-500">
                    {caseItem.taken_at ? new Date(caseItem.taken_at * 1000).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    }) : 'N/A'}
                  </td>
                  <td className="px-8 py-5 whitespace-nowrap text-right">
                    <Link
                      href={`/test-cases?case_id=${caseItem._id}`}
                      className="inline-flex items-center justify-center p-3 rounded-2xl bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-slate-50 transition-all duration-200 shadow-sm"
                    >
                      <ArrowRight className="h-5 w-5 transition-transform translate-x-0 group-hover:translate-x-1" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
