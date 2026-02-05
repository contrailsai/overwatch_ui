# Role-Based Workflow: Client vs. Reviewer

This document outlines the architectural and functional changes required to separate the **Client** and **Reviewer** workflows in the Overwatch application.

## 1. Roles & Responsibilities

### **Reviewer**
*   **Focus:** `review-cases` page.
*   **Goal:** Analyze raw/AI-processed posts, verify data, and suggest actions (takedowns).
*   **Workflow:**
    1.  Filters unreviewed cases (pre-filtered by AI Analysis & POI detection).
    2.  Selects a case to review.
    3.  **Action:** Can edit AI findings (Risk Score, Threat Type).
    4.  **Action:** Can "Suggest Takedown" (Boolean flag).
    5.  **Submit:** Completes the review.
        *   Sets `processed: true`.
        *   Saves final `review_details`.
        *   **Crucial Change:** Does NOT trigger the external alert (Slack) immediately. Instead, it marks the case as "Pending Client Approval" if a takedown is suggested.

### **Client**
*   **Focus:** `cases` (Case Management) page.
*   **Goal:** View verified threats and approve takedowns.
*   **Workflow:**
    1.  Views **only** reviewed cases (`processed: true`).
    2.  **Top Section (Priority):** "Takedown Requests" - Distinct section for cases where the Reviewer suggested a takedown.
    3.  **Main List:** All other reviewed cases (history/monitoring).
    4.  **Action:** "Start Takedown" button on priority cases.
        *   **Effect:** Changes status to "In Progress" / "Sent".
        *   **Effect:** Triggers the Slack Notification (previously done by Reviewer).
        *   **Effect:** Redirects to `takedowns` page.

---

## 2. Data Model Updates

We need to ensure the `Posts` schema (MongoDB) supports this flow.

*   **Existing Fields:**
    *   `analysis_results`: Raw AI data (ReadOnly for reference).
    *   `review_details`: Reviewer's approved version (Editable).
        *   `threat_score`
        *   `threat_type`
    *   `takedown_info`:
        *   `is_in_takedown`: Currently used for both suggestion and active status. **Need to refine.**
        *   `takedown_status`: `raised` (Reviewer suggested), `requested` (Client approved), `resolved`, etc.

*   **Proposed State Mapping:**
    *   **Reviewer Suggests Takedown:**
        *   `processed`: `true`
        *   `takedown_info.is_in_takedown`: `true` (Intent)
        *   `takedown_info.takedown_status`: `'raised'` (Ready for Client)
    *   **Client Starts Takedown:**
        *   `takedown_info.takedown_status`: `'requested'` (or stays `raised` but alert is sent) -> Moves to Takedown Dashboard.

---

## 3. Implementation Plan

### Phase 1: Reviewer Workflow Updates (`src/app/review-cases`)
*   [ ] **Modify `ReviewInterface.js`:**
    *   Update the "Takedown" checkbox label to "Suggest Takedown for Client".
    *   Ensure the form pre-fills from `analysis_results` if `review_details` is empty (already implemented).
*   [ ] **Modify `actions.js` (Reviewer):**
    *   **Stop Slack Alert:** Remove `sendSlackNotification()` from `submitCaseReview`.
    *   **Status Update:** If "Suggest Takedown" is checked, set `takedown_status` to `'raised'`.
    *   **Notification:** (Optional/Future) Notify Client via email that new cases are ready (Out of scope for this specific task, but good to note).

### Phase 2: Client Workflow Updates (`src/app/cases`)
*   [ ] **Modify `actions.js` (Client):**
    *   Update `getPosts` to strictly filter for `processed: true`.
    *   Create a new function `getTakedownSuggestions()` (or filter `getPosts`) to fetch cases where `takedown_info.takedown_status === 'raised'`.
*   [ ] **Modify `page.js` & `CasesList.js`:**
    *   **Add "Takedown Requests" Section:** A dedicated, bold banner/list at the top for `raised` cases.
    *   **Action Button:** Add "Approve & Start Takedown" button to these items.
*   [ ] **Implement Client Action:**
    *   Create a server action `approveTakedown(caseId)`:
        *   Updates status to `'requested'` (or similar).
        *   **Triggers Slack Notification** (Moved here).
        *   Redirects user to `/takedowns`.

### Phase 3: Shared Components & Cleanup
*   [ ] **Update `CaseDetailPanel.js`:**
    *   For Clients, show the *Reviewer's* data (`review_details`) primarily, falling back to AI data only if necessary (though strictly they should only see reviewed data).
    *   Ensure the "Takedown Status" is clearly visible.

---

## 4. Task List (Immediate)

1.  **Refactor Reviewer Action:** Remove Slack alert from `submitCaseReview`.
2.  **Update Client Data Fetching:** Ensure `getPosts` returns only reviewed cases.
3.  **Update Client UI:** Add "Takedown Requests" section in `CasesList`.
4.  **Implement Client Takedown Trigger:** Add the "Start Takedown" button and connect the Slack alert logic there.
