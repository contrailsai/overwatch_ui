'use client'

import { AlertTriangle, Clock } from 'lucide-react'
import Image from 'next/image'

export function RecentCasesTable({ cases }) {
  return (
    <div className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium leading-6 text-gray-900">Recent Cases</h3>
        <p className="mt-1 text-sm text-gray-500">Latest threats detected across all platforms</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Preview
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Platform
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Caption
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {cases.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-12 text-center text-sm text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  No recent cases found
                </td>
              </tr>
            ) : (
              cases.map((caseItem) => (
                <tr key={caseItem._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-12 w-12 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                      {caseItem.signedImageUrl ? (
                        <img
                          src={caseItem.signedImageUrl}
                          alt="Post preview"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <AlertTriangle className="h-6 w-6 text-gray-400" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                      caseItem.platform === 'facebook' ? 'bg-blue-100 text-blue-800' :
                      caseItem.platform === 'x' ? 'bg-gray-900 text-white' :
                      'bg-pink-100 text-pink-800'
                    }`}>
                      {caseItem.platform}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {caseItem.username}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-md">
                    <p className="line-clamp-2">{caseItem.caption || 'No caption'}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {caseItem.taken_at ? new Date(caseItem.taken_at * 1000).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    }) : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                      caseItem.threat_type === 'pending' ?
                      'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
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
