import { Database, Shield, AlertCircle, CheckCircle } from 'lucide-react'

export function MetricsCards({ metrics }) {
  const cards = [
    {
      name: 'Total Posts Crawled',
      value: metrics.totalPosts?.toLocaleString() || 0,
      icon: Database,
      color: 'text-blue-700',
      bg: 'bg-blue-50',
    },
    {
      name: 'Threats Identified',
      value: metrics.totalThreats?.toLocaleString() || 0,
      icon: Shield,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      name: 'Takedowns in Process',
      value: metrics.activeTakedowns?.toLocaleString() || 0,
      icon: AlertCircle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      name: 'Completed Takedowns',
      value: metrics.completedTakedowns?.toLocaleString() || 0,
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.name}
          className="relative overflow-hidden rounded-lg bg-white px-4 pt-5 pb-12 shadow sm:px-6 sm:pt-6 border border-gray-100"
        >
          <dt>
            <div className={`absolute rounded-md p-3 ${card.bg}`}>
              <card.icon className={`h-6 w-6 ${card.color}`} aria-hidden="true" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-gray-500">
              {card.name}
            </p>
          </dt>
          <dd className="ml-16 flex items-baseline pb-1 sm:pb-7">
            <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
          </dd>
        </div>
      ))}
    </div>
  )
}
