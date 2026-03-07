-- ============================================
-- AntiGravity Agent — Production SQL Migration
-- Run this once in Supabase SQL Editor
-- ============================================

-- ─────────────────────────────────────────────
-- 1. Add AI plan columns to startformular
-- ─────────────────────────────────────────────

ALTER TABLE public.startformular
  ADD COLUMN IF NOT EXISTS ai_plan       jsonb        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_plan_status text        DEFAULT 'pending'
    CHECK (ai_plan_status IN ('pending', 'generating', 'done', 'failed')),
  ADD COLUMN IF NOT EXISTS ai_plan_generated_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_plan_error text         DEFAULT NULL;

-- ─────────────────────────────────────────────
-- 2. RPC: Update startformulär plan
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_startformular_plan(
  start_id uuid,
  new_status text,
  plan_data jsonb DEFAULT NULL,
  error_msg text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE startformular
  SET
    ai_plan = plan_data,
    ai_plan_status = new_status,
    ai_plan_error = error_msg,
    ai_plan_generated_at = CASE WHEN new_status = 'done' THEN now() ELSE ai_plan_generated_at END
  WHERE id = start_id;
END;
$$;

-- ─────────────────────────────────────────────
-- 3. Cases table (persistent storage)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cases (
  id          text PRIMARY KEY,
  text        text NOT NULL,
  analysis    jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz DEFAULT NULL,
  execution_result jsonb DEFAULT NULL
);

-- RLS: disable for server-side access (service key)
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- 4. Cases RPC functions (SECURITY DEFINER)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION upsert_case(
  case_id text,
  case_text text,
  case_analysis jsonb,
  case_status text,
  case_created_at timestamptz,
  case_executed_at timestamptz DEFAULT NULL,
  case_execution_result jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO cases (id, text, analysis, status, created_at, executed_at, execution_result)
  VALUES (case_id, case_text, case_analysis, case_status, case_created_at, case_executed_at, case_execution_result)
  ON CONFLICT (id) DO UPDATE SET
    text = EXCLUDED.text,
    analysis = EXCLUDED.analysis,
    status = EXCLUDED.status,
    executed_at = EXCLUDED.executed_at,
    execution_result = EXCLUDED.execution_result;
END;
$$;

CREATE OR REPLACE FUNCTION get_case(case_id text)
RETURNS SETOF cases
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM cases WHERE id = case_id;
$$;

CREATE OR REPLACE FUNCTION list_cases()
RETURNS SETOF cases
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM cases ORDER BY created_at DESC;
$$;

-- ─────────────────────────────────────────────
-- 5. Update get_all_startformular to include
--    new AI plan columns
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_all_startformular()
RETURNS SETOF startformular
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM startformular ORDER BY created_at DESC;
$$;

-- ─────────────────────────────────────────────
-- 6. DB trigger: auto-generate AI plan on INSERT
--    Uses pg_net to POST to the server webhook
--    NOTE: Update the URL after deploying to Render
-- ─────────────────────────────────────────────

-- Enable pg_net extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger function
CREATE OR REPLACE FUNCTION notify_new_startformular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  webhook_url text;
  webhook_secret text;
BEGIN
  -- Set your production URL here after deploying to Render
  -- For local dev: 'http://localhost:3847/api/starts/webhook'
  webhook_url := coalesce(
    current_setting('app.webhook_url', true),
    'https://antigravity-agent.onrender.com/api/starts/webhook'
  );
  webhook_secret := coalesce(
    current_setting('app.webhook_secret', true),
    ''
  );

  PERFORM extensions.http_post(
    url := webhook_url,
    body := jsonb_build_object(
      'id', NEW.id,
      'record', row_to_json(NEW)::jsonb
    )::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    )::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail the INSERT if webhook call fails
  RAISE WARNING 'Webhook call failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_new_startformular ON startformular;
CREATE TRIGGER trg_new_startformular
  AFTER INSERT ON startformular
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_startformular();

-- ─────────────────────────────────────────────
-- Done! Summary:
-- ─────────────────────────────────────────────
-- ✓ startformular: added ai_plan, ai_plan_status, ai_plan_error, ai_plan_generated_at
-- ✓ update_startformular_plan(): RPC for storing/updating plans
-- ✓ cases: new table for persistent case storage
-- ✓ upsert_case(), get_case(), list_cases(): RPC functions
-- ✓ get_all_startformular(): updated to include new columns
-- ✓ notify_new_startformular(): DB trigger for auto-plan generation
