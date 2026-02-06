'use client'

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts'

// Metric Card Component
export function MetricCard({ title, value, subtitle, icon, gradient, trend }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 ${gradient}`}>
      <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <p className="text-white/80 text-sm font-medium uppercase tracking-wide">{title}</p>
          {icon && <span className="text-3xl opacity-70">{icon}</span>}
        </div>
        <p className="text-4xl font-bold text-white mb-1">{value}</p>
        {subtitle && <p className="text-white/70 text-sm">{subtitle}</p>}
        {trend && (
          <div className="mt-3 flex items-center">
            <span className={`text-xs font-semibold ${trend.positive ? 'text-green-200' : 'text-red-200'}`}>
              {trend.value}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// Chart Card Wrapper
export function ChartCard({ title, subtitle, children, fullWidth = false }) {
  return (
    <div className={`bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300 ${fullWidth ? 'col-span-full' : ''}`}>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// Custom Tooltip
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900/95 backdrop-blur-sm text-white px-4 py-3 rounded-lg shadow-xl border border-white/10">
        <p className="font-semibold mb-2">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: <span className="font-semibold">{entry.value.toLocaleString()}</span>
          </p>
        ))}
      </div>
    )
  }
  return null
}

export function DashboardCharts({ data }) {
  const {
    summary,
    riskDistribution,
    threatTypeDistribution,
    platformDistribution,
    dailyTrends,
    takedownFunnel,
    takedownsByStatus
  } = data

  return (
    <>
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Total Posts Collected"
          value={summary.totalPosts.toLocaleString()}
          subtitle="From MongoDB database"
          icon="📊"
          gradient="bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700"
        />
        <MetricCard
          title="Content Reviewed"
          value={summary.totalReviewed.toLocaleString()}
          subtitle={`${summary.threatDetectionRate}% threat detection rate`}
          icon="🔍"
          gradient="bg-gradient-to-br from-purple-500 via-purple-600 to-purple-700"
        />
        <MetricCard
          title="Threats Detected"
          value={summary.totalThreats.toLocaleString()}
          subtitle={`${summary.totalTakedownsInitiated} takedowns initiated`}
          icon="⚠️"
          gradient="bg-gradient-to-br from-orange-500 via-orange-600 to-red-600"
        />
        <MetricCard
          title="Active Takedowns"
          value={summary.activeTakedowns}
          subtitle={`${summary.completedTakedowns} completed • ${summary.takedownSuccessRate}% success`}
          icon="🎯"
          gradient="bg-gradient-to-br from-green-500 via-emerald-600 to-teal-600"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        {/* Risk Distribution Pie Chart */}
        <ChartCard
          title="Risk Level Distribution"
          subtitle="Classification of reviewed content by risk severity"
        >
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={riskDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                animationBegin={0}
                animationDuration={800}
              >
                {riskDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Threat Types Distribution */}
        <ChartCard
          title="Threat Type Breakdown"
          subtitle="Distribution of identified threat categories"
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={threatTypeDistribution} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" stroke="#888" />
              <YAxis dataKey="name" type="category" width={100} stroke="#888" />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" fill="#8b5cf6" radius={[0, 8, 8, 0]} animationDuration={1000}>
                {threatTypeDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Daily Trends - Reviews & Threats */}
        <ChartCard
          title="Daily Activity Trends"
          subtitle="Last 30 days of content review and threat detection"
        >
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailyTrends}>
              <defs>
                <linearGradient id="colorReviewed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorThreats" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" stroke="#888" />
              <YAxis stroke="#888" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="reviewed"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorReviewed)"
                name="Reviewed"
                animationDuration={1000}
              />
              <Area
                type="monotone"
                dataKey="threats"
                stroke="#ef4444"
                fillOpacity={1}
                fill="url(#colorThreats)"
                name="Threats"
                animationDuration={1000}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Risk Levels Over Time */}
        <ChartCard
          title="Risk Severity Trends"
          subtitle="Daily breakdown of risk classifications"
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" stroke="#888" />
              <YAxis stroke="#888" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="highRisk"
                stroke="#ef4444"
                strokeWidth={2}
                name="High Risk"
                dot={{ fill: '#ef4444' }}
                animationDuration={1000}
              />
              <Line
                type="monotone"
                dataKey="mediumRisk"
                stroke="#f59e0b"
                strokeWidth={2}
                name="Medium Risk"
                dot={{ fill: '#f59e0b' }}
                animationDuration={1000}
              />
              <Line
                type="monotone"
                dataKey="lowRisk"
                stroke="#eab308"
                strokeWidth={2}
                name="Low Risk"
                dot={{ fill: '#eab308' }}
                animationDuration={1000}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>

      {/* Full Width Charts */}
      <div className="grid grid-cols-1 gap-6 mb-6">

        {/* Platform Comparison */}
        <ChartCard
          title="Platform Performance Metrics"
          subtitle="Comparative analysis across all monitored platforms"
          fullWidth
        >
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={platformDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="platform" stroke="#888" />
              <YAxis stroke="#888" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="reviewed" fill="#3b82f6" name="Reviewed" radius={[8, 8, 0, 0]} animationDuration={1000} />
              <Bar dataKey="threats" fill="#ef4444" name="Threats" radius={[8, 8, 0, 0]} animationDuration={1000} />
              <Bar dataKey="takedowns" fill="#10b981" name="Takedowns" radius={[8, 8, 0, 0]} animationDuration={1000} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Takedown Funnel */}
        <ChartCard
          title="Takedown Pipeline Status"
          subtitle="Progress tracking through the takedown process"
          fullWidth
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={takedownFunnel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" stroke="#888" />
                <YAxis dataKey="stage" type="category" width={120} stroke="#888" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[0, 8, 8, 0]} animationDuration={1000}>
                  {takedownFunnel.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Takedown Status Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                <p className="text-sm text-blue-700 font-medium mb-1">Initiated</p>
                <p className="text-3xl font-bold text-blue-900">{takedownsByStatus.initiated}</p>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
                <p className="text-sm text-purple-700 font-medium mb-1">Email Sent</p>
                <p className="text-3xl font-bold text-purple-900">{takedownsByStatus.email_sent}</p>
              </div>
              <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-xl p-4 border border-pink-200">
                <p className="text-sm text-pink-700 font-medium mb-1">Platform Replied</p>
                <p className="text-3xl font-bold text-pink-900">{takedownsByStatus.platform_replied}</p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
                <p className="text-sm text-green-700 font-medium mb-1">Resolved</p>
                <p className="text-3xl font-bold text-green-900">{takedownsByStatus.resolved}</p>
              </div>
            </div>
          </div>
        </ChartCard>

      </div>
    </>
  )
}
