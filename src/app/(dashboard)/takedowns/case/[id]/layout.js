import { getTakedownDetails } from '../../actions';

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const { id } = resolvedParams;

  const data = await getTakedownDetails(id);

  if (!data || !data.takedown) {
    return {
      title: 'Case Not Found',
    }
  }

  const platformId = data.takedown.post_platform_id || 'Unknown';
  const shortId = platformId.length > 8 ? platformId.substring(0, 8) + '...' : platformId;

  return {
    title: `overwatch - Case #${shortId}`,
    description: `Details for takedown case #${shortId} on ${data.takedown.platform}`,
  }
}

export default function CaseLayout({ children }) {
  return children;
}
