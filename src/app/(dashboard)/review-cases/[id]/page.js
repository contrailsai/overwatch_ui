import { redirect } from 'next/navigation';

export default async function CaseRedirectPage({ params }) {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    redirect(`/review-cases?case_id=${id}`);
}
