import { redirect } from 'next/navigation'

export default async function ReviewAdByIdPage({ params }) {
  const { id } = await params
  redirect(`/review-ads?ad_id=${id}`)
}
