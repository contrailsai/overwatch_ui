'use client'

import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer
} from 'recharts'
import { Eye, Shield, Target, AlertTriangle, ArrowRight, ClipboardList } from 'lucide-react'
import { RecentCasesTable } from './RecentCasesTable'
import Link from 'next/link'

// Metric Card Component
function MetricCard({ title, value, icon }) {
    return (
        <div className={`relative overflow-hidden rounded-2xl p-6 shadow-sm border border-slate-200 transition-all duration-300 bg-white`}>
            <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                    <div className="py-2.5 rounded-xl uppercase text-xs font-bold tracking-wider text-slate-500">
                        {title}
                    </div>
                    {icon && <div className="p-2 rounded-lg">{icon}</div>}
                </div>
                <div className="flex items-baseline">
                    <p className="text-4xl font-extrabold text-slate-900 tracking-tight">{value}</p>
                </div>
            </div>
        </div>
    )
}

// Chart Card Wrapper
function ChartCard({ title, subtitle, children, fullWidth = false }) {
    return (
        <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-6 duration-300 ${fullWidth ? 'col-span-full' : ''}`}>
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h3>
                    {subtitle && <p className="text-sm font-medium text-slate-500 mt-1">{subtitle}</p>}
                </div>
            </div>
            {children}
        </div>
    )
}

// Custom Tooltip
const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/95 backdrop-blur-md border border-slate-200 p-3 rounded-xl shadow-xl ring-1 ring-black/5">
                <p className="font-bold text-slate-900 mb-2 text-xs uppercase tracking-wider">{label}</p>
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center justify-between gap-4 py-1">
                        <span className="text-sm font-medium text-slate-500">{entry.name}</span>
                        <span className="text-sm font-bold text-slate-900">{entry.value.toLocaleString()}</span>
                    </div>
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
        recentPosts,
        projectDetails
    } = data

    const showTakedowns = projectDetails?.showTakedowns !== false

    return (
        <div className="py-8 px-10 space-y-10 bg-[#f8fafc] min-h-screen">
            {/* Header Section */}
            <div className="">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                                Threat Intelligence
                            </h1>
                        </div>
                        <p className="text-slate-500 font-medium max-w-2xl leading-relaxed">
                            Real-time monitoring of content moderation across all platforms
                        </p>
                    </div>
                    <Link
                        href="/cases"
                        className="group flex items-center gap-3 px-6 py-3.5 bg-blue-600 text-white rounded-2xl font-bold transition-all duration-300 "
                    >
                        <ClipboardList className="w-5 h-5" />
                        <span>Go to Cases</span>
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                </div>
            </div>

            {/* Key Metrics Cards */}
            <div className={`grid grid-cols-1 md:grid-cols-2 ${showTakedowns ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-8`}>
                <MetricCard
                    title="Scanning Volume"
                    value={summary.totalPosts.toLocaleString()}
                    icon={<Eye className="text-indigo-500 w-7 h-7" />}
                />
                <MetricCard
                    title="Threats Detected"
                    value={summary.totalThreats.toLocaleString()}
                    icon={<AlertTriangle className="text-rose-500 w-7 h-7" />}
                />
                {showTakedowns && (
                    <MetricCard
                        title="Takedown Operations"
                        value={summary.activeTakedowns}
                        icon={<Target className="text-teal-500 w-7 h-7" />}
                    />
                )}
            </div>

            {/* Daily Trends - Reviews & Threats */}
            <ChartCard
                title="Activity Trends"
                subtitle="High-frequency monitoring of content review and threat mitigation"
            >
                <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={dailyTrends}>
                        <defs>
                            <linearGradient id="colorReviewed" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorThreats" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1} />
                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                            dataKey="date"
                            stroke="#94a3b8"
                            fontSize={11}
                            fontWeight={600}
                            tickLine={false}
                            axisLine={false}
                            dy={10}
                        />
                        <YAxis
                            stroke="#94a3b8"
                            fontSize={11}
                            fontWeight={600}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                            verticalAlign="top"
                            align="right"
                            iconType="circle"
                            wrapperStyle={{ paddingBottom: '20px' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="reviewed"
                            stroke="#6366f1"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorReviewed)"
                            name="Reviewed"
                            animationDuration={1500}
                        />
                        <Area
                            type="monotone"
                            dataKey="threats"
                            stroke="#f43f5e"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorThreats)"
                            name="Risks"
                            animationDuration={1500}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Risk Distribution Pie Chart */}
                <ChartCard
                    title="Severity Profiling"
                    subtitle="Classification of detected threats by potential impact"
                >
                    <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                            <Pie
                                data={riskDistribution}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                innerRadius={80}
                                outerRadius={110}
                                paddingAngle={5}
                                dataKey="value"
                                animationDuration={1000}
                            >
                                {riskDistribution.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* Threat Types Distribution */}
                <ChartCard
                    title="Vulnerability Breakdown"
                    subtitle="Pattern analysis of identified threat vectors"
                >
                    <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={threatTypeDistribution} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} horizontal={false} />
                            <XAxis type="number" stroke="#94a3b8" fontSize={11} fontWeight={600} hide />
                            <YAxis
                                dataKey="name"
                                type="category"
                                width={100}
                                stroke="#1e293b"
                                fontSize={12}
                                fontWeight={700}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip cursor={{ fill: '#f8fafc' }} content={<CustomTooltip />} />
                            <Bar
                                dataKey="value"
                                fill="#6366f1"
                                radius={[0, 8, 8, 0]}
                                barSize={24}
                                animationDuration={1000}
                            >
                                {threatTypeDistribution.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* Full Width Charts */}
            <div className="grid grid-cols-1 gap-8">

                {/* Platform Comparison */}
                <ChartCard
                    title="Platform Performance Metrics"
                    subtitle="Security health metrics across external digital assets"
                    fullWidth
                >
                    <ResponsiveContainer width="100%" height={380}>
                        <BarChart data={platformDistribution} barGap={12}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis
                                dataKey="platform"
                                stroke="#1e293b"
                                fontSize={12}
                                fontWeight={700}
                                axisLine={false}
                                tickLine={false}
                                dy={10}
                            />
                            <YAxis
                                stroke="#94a3b8"
                                fontSize={11}
                                fontWeight={600}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip cursor={{ fill: '#f8fafc' }} content={<CustomTooltip />} />
                            <Legend
                                verticalAlign="top"
                                align="right"
                                iconType="circle"
                                wrapperStyle={{ paddingBottom: '24px' }}
                            />
                            <Bar dataKey="reviewed" fill="#6366f1" name="Reviewed" radius={[6, 6, 0, 0]} animationDuration={1200} />
                            <Bar dataKey="threats" fill="#f43f5e" name="Risks" radius={[6, 6, 0, 0]} animationDuration={1400} />
                            {showTakedowns && <Bar dataKey="takedowns" fill="#10b981" name="Takedowns" radius={[6, 6, 0, 0]} animationDuration={1600} />}
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* Takedown Funnel */}
                {
                    showTakedowns &&
                    <ChartCard
                        title="Operational Pipeline"
                        subtitle="Strategic progression of active enforcement actions"
                        fullWidth
                    >
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                            <ResponsiveContainer width="100%" height={320}>
                                <BarChart data={takedownFunnel} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis type="number" stroke="#94a3b8" fontSize={11} fontWeight={600} hide />
                                    <YAxis
                                        dataKey="stage"
                                        type="category"
                                        width={140}
                                        stroke="#1e293b"
                                        fontSize={12}
                                        fontWeight={700}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip cursor={{ fill: '#f8fafc' }} content={<CustomTooltip />} />
                                    <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={32} animationDuration={1000}>
                                        {takedownFunnel.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>

                            {/* Takedown Status Cards */}
                            <div className="grid grid-cols-2 gap-6">
                                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm transition-all hover:shadow-md">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Initiated</p>
                                    </div>
                                    <p className="text-4xl font-black text-slate-900">{takedownsByStatus.initiated}</p>
                                </div>
                                <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm transition-all hover:shadow-md">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-2 h-2 rounded-full bg-slate-400" />
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">In Progress</p>
                                    </div>
                                    <p className="text-4xl font-black text-slate-900">{takedownsByStatus.email_sent + takedownsByStatus.platform_replied}</p>
                                </div>
                                <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100 shadow-sm transition-all hover:shadow-md col-span-2">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Successful Removals</p>
                                            </div>
                                            <p className="text-5xl font-black text-emerald-900">{takedownsByStatus.resolved}</p>
                                        </div>
                                        <Target className="w-12 h-12 text-emerald-200" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ChartCard>
                }

            </div>

            {/* Recent Cases Section */}
            <div className="pb-10">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Intelligence Feed</h2>
                        <p className="text-slate-500 font-medium">Real-time alerts and confirmed detections</p>
                    </div>
                </div>
                <RecentCasesTable cases={recentPosts || []} />
            </div>

        </div>
    )
}
