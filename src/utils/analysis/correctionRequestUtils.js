/**
 * Helpers for AI correction request lifecycle on Posts documents.
 */

import {
  extractThreatTypes,
  extractLegalCodes,
  normalizeAnalysisForForm,
} from './normalizeAnalysisForForm';

const ACTIVE_STATUSES = ['pending', 'processing'];

/**
 * @param {Array<{ id: string, status: string, requested_at?: string }> | undefined} requests
 * @returns {object | null} Most recent active correction request
 */
export function findActiveCorrectionRequest(requests) {
  if (!Array.isArray(requests) || requests.length === 0) return null;

  const active = requests.filter((r) => ACTIVE_STATUSES.includes(r.status));
  if (active.length === 0) return null;

  return active.sort((a, b) => {
    const ta = new Date(a.requested_at || 0).getTime();
    const tb = new Date(b.requested_at || 0).getTime();
    return tb - ta;
  })[0];
}

export function hasActiveCorrectionRequest(requests) {
  return findActiveCorrectionRequest(requests) != null;
}

/**
 * Build default form field values from review_details (if reviewed) or analysis_results.
 */
export function buildReviewFormDefaults(post, projectDetails) {
  const review = post?.review_details || {};
  const analysis = post?.analysis_results || {};
  const analysisPoi = analysis.poi_check || {};
  const hasReview = review && Object.keys(review).length > 0;
  const projectLabels = projectDetails?.labels || [];
  const projectLegalCodes = projectDetails?.legal_codes || [];

  return {
    threatScore: hasReview
      ? (review.threat_score ?? 0)
      : (analysis.threat_score ?? analysis.risk_score ?? 0),
    threatTypes: hasReview
      ? extractThreatTypes(review, projectLabels)
      : extractThreatTypes(analysis, projectLabels),
    selectedLegalCodes: hasReview
      ? extractLegalCodes(review, projectLegalCodes)
      : extractLegalCodes(analysis, projectLegalCodes),
    isAIGC: hasReview ? !!review.is_aigc : !!analysis.is_aigc,
    facePresent: hasReview
      ? !!review.face_present
      : !!(analysis.face_present ?? analysisPoi.face_present),
    namePresent: hasReview
      ? !!review.name_present
      : !!(analysis.name_present ?? analysisPoi.poi_name_found),
    poiNames: (hasReview ? review.poi_names : (analysis.poi_names || analysisPoi.poi_names)) || [],
    reasoningText: hasReview ? (review.reasoning || '') : (analysis.reasoning || ''),
    simpleReportText: hasReview
      ? (review.simple_report_description || '')
      : (analysis.simple_report_description || ''),
  };
}

/**
 * Form values aligned to frozen analysis_results baseline (reset-to-AI for correction).
 */
export function getAiBaselineFormValues(aiBaseline, projectDetails) {
  const normalized = normalizeAnalysisForForm(aiBaseline, projectDetails);
  return {
    threatScore: normalized.threat_score,
    threatTypes: normalized.threat_types,
    selectedLegalCodes: normalized.legal_codes,
    isAIGC: normalized.is_aigc,
    facePresent: normalized.face_present,
    namePresent: normalized.name_present,
    poiNames: normalized.poi_names,
    reasoningText: normalized.reasoning,
    simpleReportText: normalized.simple_report_description,
  };
}

/**
 * Apply form default values via setter callbacks.
 */
export function applyFormDefaults(defaults, setters) {
  setters.setThreatScore(defaults.threatScore);
  setters.setThreatTypes(defaults.threatTypes);
  setters.setSelectedLegalCodes(defaults.selectedLegalCodes);
  setters.setIsAIGC(defaults.isAIGC);
  setters.setFacePresent(defaults.facePresent);
  setters.setNamePresent(defaults.namePresent);
  setters.setPoiNames(defaults.poiNames);
  setters.setReasoningText(defaults.reasoningText);
  setters.setSimpleReportText(defaults.simpleReportText);
}
