-- Update daily_metrics table to match new requirements

-- Add new columns
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS threat_aigc_count INTEGER DEFAULT 0;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS risk_safe_count INTEGER DEFAULT 0;

-- Drop unused columns (if they exist)
ALTER TABLE daily_metrics DROP COLUMN IF EXISTS threat_violence_count;

-- Note: We are keeping threat_other_count for fallbacks.
-- The risk buckets are now:
-- risk_safe_count: 0-40
-- risk_low_count: 40-60
-- risk_medium_count: 60-85
-- risk_high_count: 85-100
