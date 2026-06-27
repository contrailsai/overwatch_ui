# Analysis Correction Request — Worker Contract

> **Team overview:** For a full guide covering both **full analysis** and **revision** workflows (SQS triggers, Mongo read/write, `analysis_results` schema), see [content-moderation-worker-guide.md](./content-moderation-worker-guide.md).

Contract between **overwatch_client** (review UI) and **overwatch-content-moderation** (AI worker) for human-guided AI analysis revisions.

## Overview

Reviewers fix AI mistakes by editing the review form. The client auto-computes a **simple correction object**, persists it on the Mongo `Posts` document as a **single overwriteable object**, and queues SQS with `mode: "revision"`.

The worker reads the correction from Mongo, uses **existing `analysis_results`** plus post content (caption, image, profile metadata), applies the correction, and replaces `analysis_results`.

**`review_details` is never modified by this flow.**

Each post has at most **one** active correction request at a time. New submissions **overwrite** the previous `analysis_correction_request` object (no append-only history on the Post document).

## Backward compatibility

| SQS message | Worker behavior |
|-------------|-----------------|
| `{ db_name, collection_name, object_id }` only | Existing full analysis — unchanged |
| Same + `mode: "revision"` + `correction_request_id` | Revision pipeline |

**Legacy posts:** Older documents may still have `analysis_correction_requests[]` (array). The client read path falls back to the latest array entry for resume-polling. New submissions write only `analysis_correction_request` (singular). Workers should prefer the singular field when present.

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

## Mongo: `Posts.analysis_correction_request`

Single object (not an array). Overwritten on each new correction request.

```typescript
{
  id: string;                    // UUID = correction_request_id in SQS; new on each submit
  status: "pending" | "processing" | "completed" | "failed";
  requested_at: string;          // ISO 8601
  requested_by: string;          // reviewer email
  correction: CorrectionPayload;
  completed_at: string | null;   // set when done (success or failure)
  error: string | null;          // set on failure; null on success
}
```

### Lifecycle

| State | `status` | `completed_at` | `error` |
|-------|----------|----------------|---------|
| Queued | `pending` | `null` | `null` |
| Worker running | `processing` | `null` | `null` |
| Success | `completed` | ISO timestamp | `null` |
| Failure | `failed` | ISO timestamp | error message |

A new correction **replaces** the entire object with a fresh `id`, `status: "pending"`, `completed_at: null`, `error: null`.

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
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "requested_at": "2026-06-16T10:00:00.000Z",
  "requested_by": "reviewer@example.com",
  "correction": {
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
  },
  "completed_at": null,
  "error": null
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
3. Read `Posts.analysis_correction_request` (singular). If missing, fall back to legacy `analysis_correction_requests[]` find by `id`.
4. **Stale-worker guard:** If `analysis_correction_request.id !== correction_request_id`, ack the message and return without writing (a newer correction overwrote this request).
5. Set `analysis_correction_request.status: "processing"` (only if `id` still matches).
6. Build Gemini prompt from post content + `analysis_results` + `correction`.
7. On success (only if `id` still matches):
   - Replace `analysis_results` (full object, same schema as full analysis)
   - Set `analysis_results.reviewed_at`
   - Set `analysis_correction_request.status: "completed"`, `completed_at`, `error: null`
   - Append `metadata.update_history`
8. On failure (only if `id` still matches): `status: "failed"`, `error`, `completed_at`
9. Do not modify `review_details`.

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

### Repeat correction (overwrite)

Reviewer submits a second correction after the first completes. Client `$set`s a new `analysis_correction_request` with a new `id`, resetting `completed_at` and `error`. Previous correction data is replaced, not appended.

---

## Client polling

Poll `getAnalysisCorrectionStatus(postId, correctionRequestId)` every 5s until `completed` / `failed` / 3 min timeout.

Returns `not_found: true` if the stored request `id` no longer matches (correction was overwritten while polling). Response may include `currentRequest` for client resync.

**Check correction status** (manual): same server action — reads `analysis_correction_request` + `analysis_results` only; does **not** reload the full Post document.

On case load, read `post.analysis_correction_request` (or legacy array fallback) for `pending`/`processing` and resume polling. After 3 min auto-poll stop, reviewer uses **Check correction status** (resumes a 60s poll burst). After 10 min elapsed (`requested_at`), UI offers **Restart correction** and **Cancel correction**.

---

## Client restart & cancel (reviewer escape hatches)

Both actions **orphan in-flight workers** by writing a **new UUID** to `analysis_correction_request`. Workers holding the old `correction_request_id` in SQS hit the stale-id guard and exit without writing.

### Restart correction

- Server action: `restartAIAnalysisCorrection(postId)`
- Reads stored `correction` from Mongo, writes new request (`status: pending`, new `id`), re-queues SQS `mode: revision`
- Same payload as the stuck request — does not re-read the live form

### Cancel correction

- Server action: `cancelAIAnalysisCorrection(postId)`
- Writes new request: `status: failed`, `error: "Cancelled by reviewer"`, new `id`, preserves `correction` for audit/retry
- Unlocks the review form; does **not** mark `failed` on the same UUID (avoids race if worker completes late)

**Worker recommendation (defense in depth):** before writing `completed`, verify `status` is still `pending` or `processing`.

---

## Client implementation

| File | Role |
|------|------|
| `src/utils/analysis/buildAnalysisCorrectionDiff.js` | Auto-compute correction; `formatStoredCorrectionForDisplay` |
| `src/utils/analysis/correctionRequestUtils.js` | `getCorrectionRequest`, active request lookup, form defaults |
| `src/utils/analysis/normalizeAnalysisForForm.js` | Normalize AI baseline for comparison |
| `src/app/(dashboard)/review-cases/actions.js` | Queue, restart, cancel, status check |
| `src/app/(dashboard)/review-cases/ReviewDetails.js` | Form orchestration, polling, resume |
| `src/app/(dashboard)/review-cases/AnalysisCorrectionPanel.js` | In-flight panel, failure state, reviewer UI |

---

## Out of worker diff (v1)

These form edits are **not** in the correction payload. Reviewers should mention in `update_note` if relevant:

- AIGC toggle
- POI face/name/tags
- Direct reasoning textarea edits

The UI shows these as neutral chips as a reminder.
