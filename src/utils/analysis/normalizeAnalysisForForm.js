/**
 * Normalize analysis_results (or review_details) into a comparable form state
 * for AI correction diffing.
 */

export function normalizeString(str) {
  if (typeof str !== 'string') return '';
  return str.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchProjectLabel(name, projectLabels) {
  const normalized = normalizeString(name);
  return projectLabels.find((l) => normalizeString(l.name) === normalized)?.name ?? null;
}

/**
 * Extract threat type labels from analysis/review source using project labels.
 */
export function extractThreatTypes(source, projectLabels) {
  if (!source || typeof source !== 'object') return [];

  const matched = new Set();

  for (const t of source.threat_types || []) {
    const match = matchProjectLabel(t, projectLabels);
    if (match) matched.add(match);
  }

  if (source.flags) {
    for (const [flagKey, value] of Object.entries(source.flags)) {
      if (value) {
        const match = matchProjectLabel(flagKey, projectLabels);
        if (match) matched.add(match);
      }
    }
  }

  return Array.from(matched);
}

/**
 * Extract legal codes aligned to project legal code names.
 */
export function extractLegalCodes(source, projectLegalCodes) {
  if (!source || typeof source !== 'object') return [];

  const codes = [];
  for (const item of source.legal_codes || []) {
    const rawCodeName = typeof item === 'string' ? item : item.code;
    const reasoning = typeof item === 'string' ? '' : item.reasoning || '';
    const match = projectLegalCodes.find(
      (c) => normalizeString(c.name) === normalizeString(rawCodeName)
    );
    if (match && !codes.some((c) => c.code === match.name)) {
      codes.push({ code: match.name, reasoning });
    }
  }
  return codes;
}

/**
 * Normalize analysis_results into form-comparable state (AI baseline).
 */
export function normalizeAnalysisForForm(analysis, projectDetails) {
  const projectLabels = projectDetails?.labels || [];
  const projectLegalCodes = projectDetails?.legal_codes || [];
  const analysisPoi = analysis?.poi_check || {};

  const threatTypes = extractThreatTypes(analysis, projectLabels);
  const legalCodes = extractLegalCodes(analysis, projectLegalCodes);

  const flags = {};
  for (const label of projectLabels) {
    flags[label.name] = threatTypes.includes(label.name);
  }

  return {
    threat_score: analysis?.threat_score ?? analysis?.risk_score ?? 0,
    threat_types: threatTypes,
    is_aigc: !!analysis?.is_aigc,
    flags,
    legal_codes: legalCodes,
    poi_names: [...(analysis?.poi_names || analysisPoi.poi_names || [])],
    face_present: !!(analysis?.face_present ?? analysisPoi.face_present),
    name_present: !!(analysis?.name_present ?? analysisPoi.poi_name_found),
    reasoning: analysis?.reasoning || '',
    simple_report_description: analysis?.simple_report_description || '',
  };
}

/**
 * Returns true when analysis_results has at least one meaningful field.
 */
export function hasAnalysisResults(analysis) {
  if (!analysis || typeof analysis !== 'object') return false;
  return Object.keys(analysis).length > 0;
}
