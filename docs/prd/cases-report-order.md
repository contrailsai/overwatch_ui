# Cases report order (posts)

**Audience:** client + `overwatch-pdf-service`  
**Surface:** `/cases` and feed post lists that export Summary / Detailed PDF|DOCX

## Contract

1. The UI table sort (`sortField` / `sortDirection`, default **engagement desc**) is passed into report job creation as `sort`.
2. Before SQS, the client reorders selected IDs with the **same list sort pipeline** as `getPosts` (`buildCasesListSortStages`).
3. SQS `postIds` is that ordered array. The PDF worker must **render in `postIds` order** and must not re-sort by threat score or any other field.

Selection click order does not matter. “Select all filtered” (`getAllPostIds` / `getFeedPostIds`) uses the same list sort.

Report cache hashes still sort IDs alphabetically, so export order does not affect job deduplication.

## SQS payload (posts)

```json
{
  "projectId": "<project_name>",
  "postIds": ["24-char hex", "..."],
  "database_name": "<tenant db>",
  "reportType": "Summary | Detailed",
  "reportFormat": "pdf | docx",
  "project": { },
  "profile": null,
  "jobId": "<reports_generation.id>"
}
```

`sort` is **not** sent on SQS; ordering is already applied to `postIds`.

## Code

| Step | Location |
|------|----------|
| Table sort | `src/app/(dashboard)/cases/page.js` → `CasesList` `initialSort` |
| Export passes sort | `ReportGenerate` → `ReportExportButton` → `useReportExport` |
| Order before SQS | `orderPostIdsForReport(ids, sort)` in `cases/actions.js` |
| Job + SQS | `getOrCreateReportJob` in `features/reports/server/actions.js` |
| Sort builders | `buildCasesListSortStages` / `normalizeCasesListSort` in `cases/riskBuckets.js` |

Full pipeline notes: [`src/app/(dashboard)/cases/CASES_DATA_FETCHING_README.md`](../../src/app/(dashboard)/cases/CASES_DATA_FETCHING_README.md).
