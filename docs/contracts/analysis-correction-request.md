# Analysis Correction Request — Worker Contract

Contract between **overwatch_client** (review UI) and **overwatch-content-moderation** (AI worker) for human-guided AI analysis revisions.

## Overview

Reviewers fix AI mistakes by editing the review form. The client auto-computes a **simple correction object**, persists it on the Mongo `Posts` document, and queues SQS with `mode: "revision"`.

The worker reads the correction from Mongo, uses **existing `analysis_results`** plus post content (caption, image, profile metadata), applies the correction, and replaces `analysis_results`.

**`review_details` is never modified by this flow.**

## Backward compatibility

| SQS message | Worker behavior |
|-------------|-----------------|
| `{ db_name, collection_name, object_id }` only | Existing full analysis — unchanged |
| Same + `mode: "revision"` + `correction_request_id` | Revision pipeline |

---

## SQS message (revision)

```json
{
  "db_name": "tenant_db",
  "collection_name": "Posts",
  "object_id": "507f1f77bcf86cd799439011",
  "mode": "revision",
  "correction_request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

Load the correction payload from Mongo — do not expect it in SQS.

---

## Mongo: `Posts.analysis_correction_requests[]`

```typescript
{
  id: string;                    // UUID = correction_request_id in SQS
  status: "pending" | "processing" | "completed" | "failed";
  requested_at: string;          // ISO 8601
  requested_by: string;          // reviewer email
  correction: CorrectionPayload;
  completed_at: string | null;
  error: string | null;
}
```

### `correction` shape

```typescript
{
  add: {
    "AI violations": string[];      // project label names to add
    "legal violations": string[];   // legal code names to add
  };
  remove: {
    "AI violations": string[];
    "legal violations": string[];
  };
  update_risk?: number;             // new threat_score — only present if reviewer changed risk
  update_note?: string;             // optional free-text from reviewer
}
```

### Example

```json
{
  "add": {
    "AI violations": ["Violence", "Hate-speech"],
    "legal violations": ["BNS - Sec 152", "BNS - Sec 196", "IT Rules - 3(1)(b)(ii)"]
  },
  "remove": {
    "AI violations": ["Anti-India-Propaganda"],
    "legal violations": ["BNS - Sec 197", "IT Act - Sec 69A"]
  },
  "update_risk": 96,
  "update_note": "Reviewer correction: Alarmist misinformation internationalized via global media tags — not anti-India propaganda. Add Violence for inflammatory genocide accusation; add Hate-speech for fabricated inter-religious massacre framing. Keep Misinformation."
}
```

Empty arrays are sent when nothing to add/remove in that category. Omit `update_risk` when risk unchanged. Omit `update_note` when reviewer left note blank.

---

## Worker inputs (revision)

| Source | Used for |
|--------|----------|
| `correction` | Apply add/remove/risk/note deltas |
| `Posts.analysis_results` | Previous AI verdict, reasoning, flags, legal reasoning |
| Post caption / content | Primary evidence |
| Post media (image) | Visual analysis |
| Profile metadata | Author context |

The worker does **not** receive `baseline_snapshot` or `desired_state` — prior analysis lives in `analysis_results`.

---

## Worker processing steps

1. Receive SQS. If `mode !== "revision"`, run existing full analysis.
2. Load post from `db_name` / `collection_name` / `object_id`.
3. Find `analysis_correction_requests` entry where `id === correction_request_id`.
4. Set `status: "processing"`.
5. Build Gemini prompt from post content + `analysis_results` + `correction`.
6. On success:
   - Replace `analysis_results` (full object, same schema as full analysis)
   - Set `analysis_results.reviewed_at`
   - Set request `status: "completed"`, `completed_at`
   - Append `metadata.update_history`
7. On failure: `status: "failed"`, `error`, `completed_at`
8. Do not modify `review_details`.

---

## Revision prompt rules

1. Start from existing `analysis_results` — treat as draft to revise, not blank slate.
2. **Add** violations/codes listed in `correction.add` — generate full reasoning for each.
3. **Remove** violations/codes listed in `correction.remove` — clear flags and related reasoning.
4. If `update_risk` present, set `threat_score` (and align risk band / takedown timeline).
5. Follow `update_note` for nuance, framing, and what to keep unchanged.
6. Regenerate `reasoning`, `simple_report_description`, `violation_reasoning`, and per-legal-code reasoning to match the revised verdict.
7. POI, AIGC, and other fields: infer from post content + `update_note` if mentioned; otherwise preserve from prior `analysis_results` unless contradicted by new violations.

---

## Worked examples

### Add/remove violations + risk

Reviewer unchecks Anti-India-Propaganda, checks Violence + Hate-speech, sets risk to 96.

Worker output: `flags` updated, `threat_types` aligned, `threat_score: 96`, reasoning rewritten per `update_note`.

### Legal code swap only

Reviewer removes `BNS - Sec 197`, adds `IT Rules - 3(1)(b)(ii)` — no `update_risk`, no `update_note`.

Worker output: `legal_codes` array updated; AI writes reasoning for new code; removes old code reasoning.

### Note-only correction

No form delta, reviewer sends only `update_note` asking to reframe misinformation analysis.

Worker output: Same violations structurally, revised reasoning and explanations.

---

## Client polling

Poll `getAnalysisCorrectionStatus(postId, correctionRequestId)` every 5s until `completed` / `failed` / 3 min timeout.

On case load, scan `post.analysis_correction_requests` for `pending`/`processing` and resume polling. On timeout, keep `activeCorrectionId` and block duplicate submits until status resolves (Refresh / Resume waiting).

---

## Client implementation

| File | Role |
|------|------|
| `src/utils/analysis/buildAnalysisCorrectionDiff.js` | Auto-compute correction from form vs `analysis_results` |
| `src/utils/analysis/correctionRequestUtils.js` | Form defaults, active request lookup |
| `src/utils/analysis/normalizeAnalysisForForm.js` | Normalize AI baseline for comparison |
| `src/app/(dashboard)/review-cases/actions.js` | Persist + queue |
| `src/app/(dashboard)/review-cases/ReviewDetails.js` | Form orchestration, polling, resume |
| `src/app/(dashboard)/review-cases/AnalysisCorrectionPanel.js` | Reviewer UI |

---

## Out of worker diff (v1)

These form edits are **not** in the correction payload. Reviewers should mention in `update_note` if relevant:

- AIGC toggle
- POI face/name/tags
- Direct reasoning textarea edits

The UI shows these as neutral chips as a reminder.
