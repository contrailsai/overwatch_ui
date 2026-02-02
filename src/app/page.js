import { Sidebar } from '@/components/Sidebar'
import { MetricsCards } from '@/components/MetricsCards'
import { ThreatChart } from '@/components/ThreatChart'
import { PlatformTrendsChart } from '@/components/PlatformTrendsChart'
import { ContentDistributionChart } from '@/components/ContentDistributionChart'
import { RecentCasesTable } from '@/components/RecentCasesTable'
import { getDashboardData } from './actions'

export default async function Home() {
  const {
    metrics,
    platformTrends,
    contentDistribution,
    threatsByPlatform,
    recentCases
  } = await getDashboardData()

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="py-6 px-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">
              Overview of threat detection and takedown activities across all platforms.
            </p>
          </div>

          {/* Metrics Cards */}
          <div className="mb-8">
            <MetricsCards metrics={metrics} />
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <PlatformTrendsChart data={platformTrends} />
            <ContentDistributionChart data={contentDistribution} />
          </div>

          {/* Threats by Category Chart */}
          <div className="mb-8">
            <ThreatChart data={threatsByPlatform} />
          </div>

          {/* Recent Cases Table */}
          <div className="mb-8">
            <RecentCasesTable cases={recentCases} />
          </div>
        </div>
      </main>
    </div>
  )
}