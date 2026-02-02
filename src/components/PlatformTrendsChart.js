'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export function PlatformTrendsChart({ data }) {
  return (
    <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
      <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Threat Trends Across Platforms</h3>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }}
            />
            <Line
              type="monotone"
              dataKey="instagram"
              stroke="#ec4899"
              strokeWidth={2}
              dot={{ fill: '#ec4899', r: 4 }}
              name="Instagram"
            />
            <Line
              type="monotone"
              dataKey="facebook"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 4 }}
              name="Facebook"
            />
            <Line
              type="monotone"
              dataKey="x"
              stroke="#1f2937"
              strokeWidth={2}
              dot={{ fill: '#1f2937', r: 4 }}
              name="X (Twitter)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
