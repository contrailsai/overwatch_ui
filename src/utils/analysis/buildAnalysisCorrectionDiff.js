/**
 * Compare AI baseline vs current form state.
 * Returns the worker correction shape + UI helpers (hasChanges, summary).
 *
 * Worker payload (stored on Posts.analysis_correction_request):
 * {
 *   add: { "AI violations": string[], "legal violations": string[] },
 *   remove: { "AI violations": string[], "legal violations": string[] },
 *   update_risk?: number,
 *   update_note?: string
 * }
 */

function getRiskLabel(score) {
  if (score < 41) return 'Safe';
  if (score < 76) return 'Low Risk';
  if (score < 96) return 'Medium Risk';
  return 'High Risk';
}

export function emptyCorrectionDiff() {
  return {
    hasChanges: false,
    summary: [],
    add: { 'AI violations': [], 'legal violations': [] },
    remove: { 'AI violations': [], 'legal violations': [] },
    update_risk: null,
  };
}

/**
 * @param {object} baseline - from normalizeAnalysisForForm(analysis_results)
 * @param {object} formState - current form values
 */
export function buildAnalysisCorrectionDiff(baseline, formState) {
  const diff = emptyCorrectionDiff();
  if (!baseline || !formState) return diff;

  const baselineScore = baseline.threat_score ?? 0;
  const formScore = formState.threatScore ?? 0;
  if (baselineScore !== formScore) {
    diff.update_risk = formScore;
    diff.summary.push(`Risk ${getRiskLabel(baselineScore)} → ${getRiskLabel(formScore)} (${baselineScore} → ${formScore})`);
  }

  const baselineTypes = new Set(baseline.threat_types || []);
  const formTypes = new Set(formState.threatTypes || []);

  for (const t of formTypes) {
    if (!baselineTypes.has(t)) {
      diff.add['AI violations'].push(t);
      diff.summary.push(`+ ${t}`);
    }
  }
  for (const t of baselineTypes) {
    if (!formTypes.has(t)) {
      diff.remove['AI violations'].push(t);
      diff.summary.push(`- ${t}`);
    }
  }

  const baselineCodeNames = (baseline.legal_codes || []).map((c) => c.code);
  const formCodeNames = (formState.selectedLegalCodes || []).map((c) => c.code);
  const baselineCodeSet = new Set(baselineCodeNames);
  const formCodeSet = new Set(formCodeNames);

  for (const code of formCodeNames) {
    if (!baselineCodeSet.has(code)) {
      diff.add['legal violations'].push(code);
      diff.summary.push(`+ Legal: ${code}`);
    }
  }
  for (const code of baselineCodeNames) {
    if (!formCodeSet.has(code)) {
      diff.remove['legal violations'].push(code);
      diff.summary.push(`- Legal: ${code}`);
    }
  }

  // Not in worker diff — surfaced in UI so reviewers can mention in update_note
  if (!!baseline.is_aigc !== !!formState.isAIGC) {
    diff.summary.push(formState.isAIGC ? 'AIGC: mark yes (add to note)' : 'AIGC: mark no (add to note)');
  }
  if (!!baseline.face_present !== !!formState.facePresent) {
    diff.summary.push(`Face detected → ${formState.facePresent ? 'yes' : 'no'} (add to note if needed)`);
  }
  if (!!baseline.name_present !== !!formState.namePresent) {
    diff.summary.push(`Name mentioned → ${formState.namePresent ? 'yes' : 'no'} (add to note if needed)`);
  }

  diff.hasChanges =
    diff.add['AI violations'].length > 0 ||
    diff.remove['AI violations'].length > 0 ||
    diff.add['legal violations'].length > 0 ||
    diff.remove['legal violations'].length > 0 ||
    diff.update_risk != null;

  return diff;
}

/**
 * Build the correction object persisted for the worker (update_note merged at submit).
 */
export function buildCorrectionPayload(diff, updateNote) {
  const note = updateNote?.trim() || null;
  const payload = {
    add: {
      'AI violations': [...(diff.add?.['AI violations'] || [])],
      'legal violations': [...(diff.add?.['legal violations'] || [])],
    },
    remove: {
      'AI violations': [...(diff.remove?.['AI violations'] || [])],
      'legal violations': [...(diff.remove?.['legal violations'] || [])],
    },
  };

  if (diff.update_risk != null) {
    payload.update_risk = diff.update_risk;
  }

  if (note) {
    payload.update_note = note;
  }

  return payload;
}

export function correctionPayloadHasChanges(payload) {
  if (!payload) return false;
  if (payload.update_note?.trim()) return true;
  if (payload.update_risk != null) return true;
  const addAi = payload.add?.['AI violations']?.length > 0;
  const addLegal = payload.add?.['legal violations']?.length > 0;
  const remAi = payload.remove?.['AI violations']?.length > 0;
  const remLegal = payload.remove?.['legal violations']?.length > 0;
  return addAi || addLegal || remAi || remLegal;
}

/**
 * Format a persisted worker correction payload for read-only UI chips.
 * @param {object | null | undefined} correction
 */
export function formatStoredCorrectionForDisplay(correction) {
  const empty = {
    hasChanges: false,
    update_risk: null,
    update_note: null,
    add: { 'AI violations': [], 'legal violations': [] },
    remove: { 'AI violations': [], 'legal violations': [] },
  };
  if (!correction || typeof correction !== 'object') return empty;

  const add = {
    'AI violations': [...(correction.add?.['AI violations'] || [])],
    'legal violations': [...(correction.add?.['legal violations'] || [])],
  };
  const remove = {
    'AI violations': [...(correction.remove?.['AI violations'] || [])],
    'legal violations': [...(correction.remove?.['legal violations'] || [])],
  };
  const update_risk = correction.update_risk != null ? correction.update_risk : null;
  const update_note = correction.update_note?.trim() || null;

  const hasChanges =
    add['AI violations'].length > 0 ||
    add['legal violations'].length > 0 ||
    remove['AI violations'].length > 0 ||
    remove['legal violations'].length > 0 ||
    update_risk != null ||
    !!update_note;

  return { hasChanges, update_risk, update_note, add, remove };
}

/**
 * Apply a stored correction payload onto baseline form values (for Try again).
 * @param {object} baseline - from normalizeAnalysisForForm(analysis_results)
 * @param {object | null | undefined} correction
 */
export function applyStoredCorrectionToFormState(baseline, correction) {
  if (!baseline || !correction) return null;

  const threatTypes = new Set(baseline.threat_types || []);
  for (const t of correction.add?.['AI violations'] || []) threatTypes.add(t);
  for (const t of correction.remove?.['AI violations'] || []) threatTypes.delete(t);

  const legalByCode = new Map((baseline.legal_codes || []).map((c) => [c.code, { ...c }]));
  for (const code of correction.add?.['legal violations'] || []) {
    if (!legalByCode.has(code)) legalByCode.set(code, { code, reasoning: '' });
  }
  for (const code of correction.remove?.['legal violations'] || []) {
    legalByCode.delete(code);
  }

  return {
    threatScore: correction.update_risk != null ? correction.update_risk : baseline.threat_score,
    threatTypes: [...threatTypes],
    selectedLegalCodes: [...legalByCode.values()],
    update_note: correction.update_note?.trim() || '',
  };
}
