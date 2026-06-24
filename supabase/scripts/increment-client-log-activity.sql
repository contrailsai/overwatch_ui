-- Atomic upsert for client_logs daily activity counters.
-- Run on production + dev Supabase before relying on RPC path in the app.
-- Idempotent: safe to re-run (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.increment_client_log_activity(
  p_client_id uuid,
  p_project_name text,
  p_date date,
  p_last_activity time with time zone,
  p_login_time time with time zone DEFAULT NULL,
  p_reviewed_cases_delta integer DEFAULT 0,
  p_reviewed_profiles_delta integer DEFAULT 0,
  p_report_download_key text DEFAULT NULL,
  p_report_download_delta integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cases_delta integer := GREATEST(COALESCE(p_reviewed_cases_delta, 0), 0);
  v_profiles_delta integer := GREATEST(COALESCE(p_reviewed_profiles_delta, 0), 0);
  v_report_delta integer := GREATEST(COALESCE(p_report_download_delta, 0), 0);
  v_reports jsonb;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_report_download_key IS NOT NULL AND v_report_delta > 0 THEN
    v_reports := jsonb_build_object(p_report_download_key, v_report_delta);
  ELSE
    v_reports := '{}'::jsonb;
  END IF;

  INSERT INTO client_logs (
    client_id,
    project_name,
    date,
    last_activity,
    login_time,
    reviewed_cases,
    reviewed_profiles,
    reports_download
  )
  VALUES (
    p_client_id,
    p_project_name,
    p_date,
    p_last_activity,
    p_login_time,
    v_cases_delta,
    v_profiles_delta,
    v_reports
  )
  ON CONFLICT ON CONSTRAINT client_logs_unique_day
  DO UPDATE SET
    last_activity = EXCLUDED.last_activity,
    login_time = COALESCE(client_logs.login_time, EXCLUDED.login_time),
    reviewed_cases = COALESCE(client_logs.reviewed_cases, 0) + v_cases_delta,
    reviewed_profiles = COALESCE(client_logs.reviewed_profiles, 0) + v_profiles_delta,
    reports_download = CASE
      WHEN p_report_download_key IS NOT NULL AND v_report_delta > 0 THEN
        COALESCE(client_logs.reports_download, '{}'::jsonb)
        || jsonb_build_object(
          p_report_download_key,
          COALESCE(
            (COALESCE(client_logs.reports_download, '{}'::jsonb) ->> p_report_download_key)::integer,
            0
          ) + v_report_delta
        )
      ELSE client_logs.reports_download
    END;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_client_meta_stats(
  p_client_id uuid,
  p_project_name text,
  p_reviewed_cases_delta integer DEFAULT 0,
  p_reviewed_profiles_delta integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cases_delta integer := GREATEST(COALESCE(p_reviewed_cases_delta, 0), 0);
  v_profiles_delta integer := GREATEST(COALESCE(p_reviewed_profiles_delta, 0), 0);
BEGIN
  IF auth.uid() IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE client_details
  SET meta_stats = jsonb_build_object(
    'reviewed_cases',
    COALESCE((meta_stats ->> 'reviewed_cases')::integer, 0) + v_cases_delta,
    'reviewed_profiles',
    COALESCE((meta_stats ->> 'reviewed_profiles')::integer, 0) + v_profiles_delta
  )
  WHERE id = p_client_id
    AND project_name = p_project_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_client_log_activity(
  uuid, text, date, time with time zone, time with time zone, integer, integer, text, integer
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.increment_client_meta_stats(
  uuid, text, integer, integer
) TO authenticated;
