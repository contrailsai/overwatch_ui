'use client'

import { AlertTriangle, Clock, Image as ImageIcon } from 'lucide-react'

export function RecentCasesTable({ cases }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100">
        <h3 className="text-lg font-semibold leading-6 text-slate-900">Recent Cases</h3>
        <p className="mt-1 text-sm text-slate-500">Latest threats detected across all platforms</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Preview
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Platform
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                User
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Caption
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Date
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {cases.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-12 text-center text-sm text-slate-500">
                  <Clock className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  No recent cases found
                </td>
              </tr>
            ) : (
              cases.map((caseItem) => (
                <tr key={caseItem._id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-12 w-12 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center border border-slate-100">
                      {caseItem.signedImageUrl ? (
                        <img
                          src={caseItem.signedImageUrl}
                          alt="Post preview"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wide border ${
                      caseItem.platform === 'facebook' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                      caseItem.platform === 'x' ? 'bg-slate-900 text-white border-slate-900' :
                      'bg-pink-50 text-pink-700 border-pink-100'
                    }`}>
                      {caseItem.platform}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    {caseItem.username}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 max-w-xs xl:max-w-md">
                    <p className="line-clamp-2 leading-relaxed">{caseItem.caption || 'No caption'}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {caseItem.taken_at ? new Date(caseItem.taken_at * 1000).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    }) : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      caseItem.threat_type === 'pending' ?
                      'bg-amber-50 text-amber-700 border border-amber-100' :
                      'bg-rose-50 text-rose-700 border border-rose-100'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        caseItem.threat_type === 'pending' ? 'bg-amber-500' : 'bg-rose-500'
                      }`} />
                      {caseItem.threat_type || 'Pending Review'}
                    </span>
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
