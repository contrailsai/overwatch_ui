# 🔄 Role-Based Workflow: Intelligence vs. Execution

This document outlines the architectural and functional separation between the **Reviewer** (Intelligence Analyst) and the **Client** (Decision Maker) workflows within the Overwatch platform.

---

## 1. Roles & Responsibilities

### 🕵️ Reviewer (Intelligence Analyst)
*   **Focus:** `(dashboard)/review-cases` page.
*   **Goal:** Filter through raw AI-ingested posts, verify threat validity, and refine intelligence.
*   **Workflow:**
    1.  **Queue Management:** Process unreviewed posts (`processed: false`) pre-filtered by AI risk scores.
    2.  **Analysis:** Refine AI-suggested fields (Threat Type, Risk Score).
    3.  **Suggestion:** If a threat requires action, mark it as `is_in_takedown: true` with a status of `raised`.
    4.  **Submission:** 
        *   Sets `processed: true`.
        *   Triggers **Supabase Metrics Update** (Daily Reviewed Metrics).
        *   **Important:** No external notifications (Slack) are sent at this stage to prevent noise.

### 🏛️ Client (Decision Maker)
*   **Focus:** `(dashboard)/cases` page.
*   **Goal:** High-level oversight, approval of takedown actions, and reporting.
*   **Workflow:**
    1.  **Verification:** View only processed intelligence (`processed: true`).
    2.  **Priority Action:** Identify cases with `takedown_status: 'raised'` (Suggested by Reviewers).
    3.  **Execution:** Click **"Approve Takedown"**:
        *   Changes status to `requested`.
        *   **Triggers Slack Notification** to the enforcement team.
        *   Updates **Supabase Audit Logs** (`client_logs`).
    4.  **Reporting:** Generate PDF/Docx reports via `reports_generation` in Supabase.

---

## 2. Hybrid Data Model Synchronization

To support this decoupled workflow, we utilize both MongoDB (for content) and Supabase (for state/metrics).

### MongoDB (`Posts` Collection)
| Field | State | Description |
| :--- | :--- | :--- |
| `processed` | Boolean | `false` (Reviewer Queue), `true` (Client Dashboard). |
| `review_details` | Object | Finalized intelligence (score, types, legal codes). |
| `takedown_info.is_in_takedown` | Boolean | Intent to remove content. |
| `takedown_info.takedown_status` | Enum | `none` → `raised` (Reviewer) → `requested` (Client Approval) → `resolved`. |

### Supabase (State & Analytics)
| Table | Usage in Workflow |
| :--- | :--- |
| `daily_reviewed_metrics` | Updated when Reviewer sets `processed: true`. |
| `client_logs` | Logs Client actions (approvals, logins, report exports). |
| `notifications` | Triggers in-app alerts for Clients when high-risk cases are "raised". |
| `reports_generation` | Tracks the lifecycle of case exports initiated by the Client. |

---

## 3. Security & Access Control

Access is gated via **Supabase Auth + `client_details` permissions**:
- **Middleware:** Validates session and redirects unauthenticated users to `/login`.
- **Role Gating:** 
    - `getUserPermission()` checks if user is `reviewer` for ingestion/analysis routes.
    - `client` role is restricted to viewing verified data and executing approvals.
