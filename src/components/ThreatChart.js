'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export function ThreatChart({ data }) {
  return (
    <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
      <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Threats by Category & Platform</h3>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="category"
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              contentStyle={{
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }}
            />
            <Bar dataKey="instagram" fill="#ec4899" radius={[4, 4, 0, 0]} name="Instagram" />
            <Bar dataKey="facebook" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Facebook" />
            <Bar dataKey="x" fill="#1f2937" radius={[4, 4, 0, 0]} name="X (Twitter)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
