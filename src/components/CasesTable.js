'use client'

import { AlertTriangle, Clock, CheckCircle, AlertOctagon } from 'lucide-react'

export function CasesTable({ cases }) {
  const getThreatColor = (score) => {
    if (score >= 80) return 'text-red-600 bg-red-50 border-red-100'
    if (score >= 50) return 'text-orange-600 bg-orange-50 border-orange-100'
    return 'text-yellow-600 bg-yellow-50 border-yellow-100'
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium leading-6 text-gray-900">All Cases</h3>
          <p className="mt-1 text-sm text-gray-500">Manage and track identified threats</p>
        </div>
        <span className="bg-gray-100 text-gray-600 py-1 px-3 rounded-full text-xs font-medium">
          {cases.length} Total
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Preview
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Details
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Threat Assessment
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {cases.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-sm text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  No cases found
                </td>
              </tr>
            ) : (
              cases.map((caseItem) => (
                <tr key={caseItem.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-16 w-16 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center border border-gray-200">
                      {caseItem.signedImageUrl ? (
                        <img
                          src={caseItem.signedImageUrl}
                          alt="Case evidence"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <AlertTriangle className="h-6 w-6 text-gray-400" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">{caseItem.profile_username || 'Unknown User'}</span>
                      <span className={`inline-flex w-fit items-center px-2 py-0.5 rounded text-xs font-medium mt-1 mb-1 capitalize ${
                        caseItem.platform === 'facebook' ? 'bg-blue-100 text-blue-800' :
                        caseItem.platform === 'x' ? 'bg-black text-white' :
                        'bg-pink-100 text-pink-800'
                      }`}>
                        {caseItem.platform}
                      </span>
                      <p className="text-sm text-gray-500 line-clamp-2 max-w-xs">
                        {caseItem.caption || 'No caption'}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col space-y-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 w-fit capitalize">
                        {caseItem.threat_type?.replace('_', ' ')}
                      </span>
                      <div className={`flex items-center px-2.5 py-1 rounded-md border w-fit ${getThreatColor(caseItem.threat_score)}`}>
                        <AlertOctagon className="w-3 h-3 mr-1.5" />
                        <span className="text-xs font-bold">{caseItem.threat_score}/100</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                      caseItem.takedown_status === 'completed' ? 'bg-green-100 text-green-800' :
                      caseItem.is_in_takedown ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {caseItem.takedown_status || 'Logged'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(caseItem.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
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
