import { getDashboardData } from './actions'
import { DashboardContent } from '@/components/DashboardContent'

export const metadata = {
  title: 'overwatch - Dashboard',
  description: 'Overview of threat detection metrics and trends.',
}

export default async function Home() {
  const data = await getDashboardData()

  return <DashboardContent data={data} />
}
