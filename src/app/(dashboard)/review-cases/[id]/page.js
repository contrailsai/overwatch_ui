import { redirect } from 'next/navigation';
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { isSectionEnabled } from '@/lib/project-sections'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'

export default async function CaseRedirectPage({ params }) {
    const result = await getClientandProjectDetails()
    if (!isSectionEnabled(result?.project, 'posts')) {
        return <DisabledSectionFallback />
    }
    const resolvedParams = await params;
    const { id } = resolvedParams;
    redirect(`/review-cases?case_id=${id}`);
}
