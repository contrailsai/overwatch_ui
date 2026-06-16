/**
 * Helpers for AI correction request lifecycle on Posts documents.
 */

import {
  extractThreatTypes,
  extractLegalCodes,
  normalizeAnalysisForForm,
} from './normalizeAnalysisForForm';

const ACTIVE_STATUSES = ['pending', 'processing'];

function getLatestLegacyCorrectionRequest(requests) {
  if (!Array.isArray(requests) || requests.length === 0) return null;

  return [...requests].sort((a, b) => {
    const ta = new Date(a.requested_at || 0).getTime();
    const tb = new Date(b.requested_at || 0).getTime();
    return tb - ta;
  })[0];
}

/**
 * @param {object | null | undefined} post
 * @returns {object | null} Current correction request (singular field, or latest legacy array entry)
 */
export function getCorrectionRequest(post) {
  if (!post) return null;

  const singular = post.analysis_correction_request;
  if (singular && typeof singular === 'object' && !Array.isArray(singular)) {
    return singular;
  }

  return getLatestLegacyCorrectionRequest(post.analysis_correction_requests);
}

/**
 * @param {object | null | undefined} request
 * @returns {boolean}
 */
export function isActiveCorrectionRequest(request) {
  return request != null && ACTIVE_STATUSES.includes(request.status);
}

/**
 * @param {object | null | undefined} post
 * @returns {object | null} Active correction request, if any
 */
export function findActiveCorrectionRequest(post) {
  const request = getCorrectionRequest(post);
  return isActiveCorrectionRequest(request) ? request : null;
}

export function hasActiveCorrectionRequest(post) {
  return findActiveCorrectionRequest(post) != null;
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
