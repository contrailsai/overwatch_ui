-- Daily metrics dedupe verification and unique constraints
-- Run in Supabase SQL editor AFTER dedupe script (scripts/dedupe-daily-metrics.js)
-- Deploy order: verify → dedupe script → verify again → add constraints

-- 1) Find duplicate metric rows
SELECT date, platform, project_name, COUNT(*) AS cnt
FROM daily_reviewed_metrics
GROUP BY date, platform, project_name
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

SELECT date, platform, project_name, COUNT(*) AS cnt
FROM daily_case_metrics
GROUP BY date, platform, project_name
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- 2) Add unique constraints (only after duplicate groups are zero)
ALTER TABLE daily_reviewed_metrics
ADD CONSTRAINT daily_reviewed_metrics_day_platform_project_unique
UNIQUE (date, platform, project_name);

ALTER TABLE daily_case_metrics
ADD CONSTRAINT daily_case_metrics_day_platform_project_unique
UNIQUE (date, platform, project_name);
