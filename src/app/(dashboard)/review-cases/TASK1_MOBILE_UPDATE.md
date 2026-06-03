# Task 1 — Mobile View Support (Review Update)

**Status:** Implemented  
**Date:** 2026-06-01  
**Scope:** `/review-cases` list + detail drawer only (no server/filter logic changes)

---

## Summary

The review-cases page now works on phone and tablet widths. The list uses compact cards on small screens, filters move into a bottom drawer, the detail panel is full-width on mobile, and the review form stacks vertically instead of forcing a 1200px side-by-side layout.

---

## Files changed

| File | Change |
|------|--------|
| [`ReviewInterface.js`](ReviewInterface.js) | Mobile toolbar, card list, responsive drawer, pagination, extracted helpers |
| [`ReviewDetails.js`](ReviewDetails.js) | Stacked layout on mobile, responsive padding and media height |
| [`ReviewCasesFilterPanel.js`](ReviewCasesFilterPanel.js) | **New** — shared filter controls for desktop + drawer |
| [`MobileReviewCasesFilterDrawer.js`](MobileReviewCasesFilterDrawer.js) | **New** — bottom sheet filter UI (`lg:hidden`) |

---

## What changed (by sub-task)

### 1. Detail drawer — full width on mobile

- Drawer width: `w-[1200px]` → `w-full max-w-[1200px]`
- Backdrop blur overlay hidden on mobile (`!isMobile`) so the review panel feels like a full-screen view
- When a case is open on mobile, the list is hidden (`hidden` on main column) — same pattern as `/cases`

### 2. Mobile filter drawer + compact toolbar

- **`lg:hidden` toolbar:** case count, Filters button (blue dot when filters active), Export dropdown
- **`hidden lg:block`:** existing desktop filter header unchanged in behavior
- Filters live in [`MobileReviewCasesFilterDrawer.js`](MobileReviewCasesFilterDrawer.js); drawer closes after a filter is applied
- Filter fields extracted to [`ReviewCasesFilterPanel.js`](ReviewCasesFilterPanel.js) to avoid duplication

### 3. Card list below `md`

- **`< md`:** vertical card list with thumbnail, username, online/takedown badge, 2-line caption, abbreviated dates, Review + JSON actions
- **`md+`:** existing table (unchanged columns)
- Shared `PostPlatformBadge` helper reduces duplicated platform icon markup

### 4. ReviewDetails responsive layout

- Main split: `flex-col lg:flex-row` (was always horizontal)
- Form column: `w-full lg:w-[500px]` (was fixed 500px)
- Headers: tighter padding (`px-4 sm:px-6`), truncated case ID on small screens
- Left header nav arrows hidden on `sm` (form column still has prev/next)
- Media block: `min-h-[220px] sm:min-h-[400px]`
- Engagement stats: `grid grid-cols-2` on mobile, row on `sm+`

### 5. Pagination

- Mobile: prev/next only + `current/total` text
- Desktop: full page number buttons + first/last

---

## Breakpoints used

| Breakpoint | Behavior |
|------------|----------|
| `< md` (767px) | Card list, mobile toolbar, simplified pagination |
| `< lg` (1023px) | Filters in drawer; desktop filter bar hidden |
| `lg+` | Desktop filters inline + table list |

Uses existing [`useIsMobile`](../../hooks/use-media-query.js) hook (`max-width: 767px`) for list-hide-when-detail-open behavior.

---

## Manual QA checklist

Test at **390px** (phone) and **768px** (tablet):

- [ ] List shows cards, not horizontal table scroll
- [ ] Filters open in bottom drawer; applying a filter closes drawer and updates URL
- [ ] Export still works from mobile toolbar
- [ ] Tap a case → full-width review panel; list disappears on phone
- [ ] Close (X) returns to list
- [ ] Prev/next navigation works in review form
- [ ] Scroll long captions / AI analysis sections without layout break
- [ ] Pagination prev/next on mobile
- [ ] Desktop (`≥1024px`) unchanged: inline filters + table

---

## Not in this task (planned later)

- Export Select reset bug (Task 2)
- New filters: visibility, AI risk, non-empty `analysis_results` (Tasks 3–5)
- Result Origin panel redesign (Task 6)

---

## Notes for reviewers

1. **Tablet (`768–1023px`):** Table shows (md+) but filters still use drawer until `lg`. This matches the plan’s “filters in drawer below lg”.
2. **Date filters in drawer:** Sourcing/Publish date popovers apply inside the drawer; drawer auto-closes on apply (same as select/checkbox filters).
3. No backend or `actions.js` changes — purely client layout.
