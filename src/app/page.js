import { getDashboardData } from './actions'
import { DashboardContent } from '@/components/DashboardContent'

export default async function Home() {
  const data = await getDashboardData()

  return <DashboardContent data={data} />
}
