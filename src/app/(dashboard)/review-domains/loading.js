import { ListTablePageSkeleton } from '@/components/skeletons/ListTablePageSkeleton'

export default function Loading() {
  return (
    <ListTablePageSkeleton
      title="Review Domains"
      entity="domain"
    />
  )
}
