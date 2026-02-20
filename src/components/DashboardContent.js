'use client'

import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer
} from 'recharts'
import { Eye, Shield, Target, AlertTriangle } from 'lucide-react'
import { RecentCasesTable } from './RecentCasesTable'

// Metric Card Component
function MetricCard({ title, value, subtitle, icon, gradient, trend }) {
    return (
        <div className={`relative overflow-hidden rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 ${gradient}`}>
            <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
            <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-gray-600 text-sm font-medium uppercase tracking-wide">{title}</p>
                    {icon && <span className="text-3xl opacity-70">{icon}</span>}
                </div>
                <p className="text-4xl font-bold text-gray-600 mb-1">{value}</p>
                {subtitle && <p className="text-gray-600 text-sm">{subtitle}</p>}
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
function ChartCard({ title, subtitle, children, fullWidth = false }) {
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
            <div className="bg-white/95 backdrop-blur-sm border border-slate-200 p-3 rounded-lg shadow-xl">
                <p className="font-semibold text-slate-900 mb-2">{label}</p>
                {payload.map((entry, index) => (
                    <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
                        {entry.name}: <span className="text-slate-700 font-bold">{entry.value.toLocaleString()}</span>
                    </p>
                ))}
            </div>
        )
    }
    return null
}

export function DashboardContent({ data }) {
    const {
        summary,
        riskDistribution,
        threatTypeDistribution,
        platformDistribution,
        dailyTrends,
        takedownFunnel,
        takedownsByStatus,
        recentPosts
    } = data

    // console.log(threatTypeDistribution)

    return (
        <div className="py-8 px-8 space-y-8">
            {/* Header Section */}
            <div>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">
                            Threat Intelligence Dashboard
                        </h1>
                        <p className="mt-2 text-slate-600">
                            Real-time monitoring of content moderation across all platforms
                        </p>
                    </div>
                </div>
            </div>

            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <MetricCard
                    title="Total Posts Scanned"
                    value={summary.totalPosts.toLocaleString()}
                    subtitle=""
                    icon={<Eye className="text-slate-500" />}
                    gradient="bg-white border border-slate-200"
                />
                {/* <MetricCard
                        title="Content Reviewed"
                        value={summary.totalReviewed.toLocaleString()}
                        subtitle={`${summary.threatDetectionRate}% threat detection rate`}
                        icon="🔍"
                        gradient="bg-gradient-to-br from-purple-500 via-purple-600 to-purple-700"
                    /> */}
                <MetricCard
                    title="Threats Detected"
                    value={summary.totalThreats.toLocaleString()}
                    subtitle={`${summary.totalTakedownsInitiated} takedowns initiated`}
                    icon={<AlertTriangle className="text-rose-500" />}
                    gradient="bg-rose-50/50 border border-rose-100"
                />
                <MetricCard
                    title="Active Takedowns"
                    value={summary.activeTakedowns}
                    subtitle={`${summary.completedTakedowns} completed • ${summary.takedownSuccessRate}% success`}
                    icon={<Target className="text-teal-600" />}
                    gradient="bg-teal-50/50 border border-teal-100"
                />
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

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
                        <BarChart data={threatTypeDistribution} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                            <YAxis dataKey="name" type="category" width={100} stroke="#94a3b8" fontSize={12} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="value" fill="#818cf8" radius={[0, 4, 4, 0]} animationDuration={1000}>
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
                                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorThreats" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend iconType="circle" />
                            <Area
                                type="monotone"
                                dataKey="reviewed"
                                stroke="#94a3b8"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorReviewed)"
                                name="Reviewed"
                                animationDuration={1000}
                            />
                            <Area
                                type="monotone"
                                dataKey="threats"
                                stroke="#f87171"
                                strokeWidth={2}
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
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend iconType="circle" />
                            <Line
                                type="monotone"
                                dataKey="highRisk"
                                stroke="#f87171"
                                strokeWidth={2}
                                name="High Risk"
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 0 }}
                                animationDuration={1000}
                            />
                            <Line
                                type="monotone"
                                dataKey="mediumRisk"
                                stroke="#fbbf24"
                                strokeWidth={2}
                                name="Medium Risk"
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 0 }}
                                animationDuration={1000}
                            />
                            <Line
                                type="monotone"
                                dataKey="lowRisk"
                                stroke="#fcd34d"
                                strokeWidth={2}
                                name="Low Risk"
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 0 }}
                                animationDuration={1000}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>

            </div>

            {/* Full Width Charts */}
            <div className="grid grid-cols-1 gap-6">

                {/* Platform Comparison */}
                <ChartCard
                    title="Platform Performance Metrics"
                    subtitle="Comparative analysis across all monitored platforms"
                    fullWidth
                >
                    <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={platformDistribution}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="platform" stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend iconType="circle" />
                            <Bar dataKey="reviewed" fill="#94a3b8" name="Reviewed" radius={[4, 4, 0, 0]} animationDuration={1000} />
                            <Bar dataKey="threats" fill="#f87171" name="Threats" radius={[4, 4, 0, 0]} animationDuration={1000} />
                            <Bar dataKey="takedowns" fill="#4fd1c5" name="Takedowns" radius={[4, 4, 0, 0]} animationDuration={1000} />
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
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis type="number" stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} />
                                <YAxis dataKey="stage" type="category" width={120} stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]} animationDuration={1000}>
                                    {takedownFunnel.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>

                        {/* Takedown Status Cards */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                <p className="text-sm text-slate-500 font-medium mb-1">Initiated</p>
                                <p className="text-3xl font-bold text-slate-900">{takedownsByStatus.initiated}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                <p className="text-sm text-slate-500 font-medium mb-1">Email Sent</p>
                                <p className="text-3xl font-bold text-slate-900">{takedownsByStatus.email_sent}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                <p className="text-sm text-slate-500 font-medium mb-1">Platform Replied</p>
                                <p className="text-3xl font-bold text-slate-900">{takedownsByStatus.platform_replied}</p>
                            </div>
                            <div className="bg-teal-50/50 rounded-xl p-4 border border-teal-100">
                                <p className="text-sm text-teal-700 font-medium mb-1">Resolved</p>
                                <p className="text-3xl font-bold text-teal-900">{takedownsByStatus.resolved}</p>
                            </div>
                        </div>
                    </div>
                </ChartCard>

            </div>

            {/* Recent Cases Section */}
            <div>
                <RecentCasesTable cases={recentPosts || []} />
            </div>

        </div>
    )
}
