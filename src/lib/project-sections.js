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

export const LANDING_PAGE_OPTIONS = [
  { value: '/cases', label: 'Posts', section: 'posts' },
  { value: '/ads', label: 'Ads', section: 'ads' },
  { value: '/domains', label: 'Domains', section: 'domains' },
  { value: '/', label: 'Analytics', section: null },
  { value: '/feeds', label: 'Feeds', section: 'feeds' },
]

const LANDING_PAGE_VALUES = new Set(LANDING_PAGE_OPTIONS.map((o) => o.value))

export function normalizeDefaultLandingPage(value) {
  if (typeof value === 'string' && LANDING_PAGE_VALUES.has(value)) {
    return value
  }
  return '/'
}

export function resolveDefaultLandingPage(projectDetails) {
  const path = normalizeDefaultLandingPage(projectDetails?.default_landing_page)
  const option = LANDING_PAGE_OPTIONS.find((o) => o.value === path)
  if (!option) return '/'
  if (!option.section) return path

  const sections = getEnabledSections(projectDetails)
  if (sections[option.section] === false) return '/'
  return path
}
