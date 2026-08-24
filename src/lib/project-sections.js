export const PROJECT_SECTIONS = ['posts', 'ads', 'domains', 'feeds']

export const SECTION_META = {
  posts: {
    label: 'Posts',
    description: 'Cases, profiles, and their review queues',
  },
  ads: {
    label: 'Ads',
    description: 'Ad creatives, advertiser pages, and their review queues',
  },
  domains: {
    label: 'Domains',
    description: 'Discovered domains and their review queue',
  },
  feeds: {
    label: 'Feeds',
    description: 'Feeds and Manage Feeds',
  },
}

export function getEnabledSections(projectDetails) {
  const raw = projectDetails?.sections
  return {
    posts: raw?.posts !== false,
    ads: raw?.ads !== false,
    domains: raw?.domains !== false,
    feeds: raw?.feeds !== false,
  }
}

export function isSectionEnabled(project, section) {
  if (!PROJECT_SECTIONS.includes(section)) return true
  return getEnabledSections(project?.project_details)[section]
}

export function normalizeSections(input) {
  return {
    posts: input?.posts !== false,
    ads: input?.ads !== false,
    domains: input?.domains !== false,
    feeds: input?.feeds !== false,
  }
}
