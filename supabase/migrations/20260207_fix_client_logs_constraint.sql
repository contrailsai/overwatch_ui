-- Add unique constraint to client_logs to prevent multiple entries for the same day
-- First, clean up any duplicates if they exist (keep the one with earliest login_time or latest activity)
DELETE FROM client_logs a USING client_logs b
WHERE a.id < b.id 
  AND a.client_id = b.client_id 
  AND a.project_name = b.project_name 
  AND a.date = b.date;

-- Add the unique constraint
ALTER TABLE client_logs ADD CONSTRAINT client_logs_unique_day UNIQUE (client_id, project_name, date);
