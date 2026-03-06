-- ══════════════════════════════════════════════════════════
-- Trainerize Webhook Tables
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ══════════════════════════════════════════════════════════

-- 1. Raw webhook events log (stores ALL incoming webhooks)
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  client_id integer,
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_webhook_events_type ON webhook_events (event_type);
CREATE INDEX idx_webhook_events_client ON webhook_events (client_id);
CREATE INDEX idx_webhook_events_created ON webhook_events (created_at DESC);

-- 2. Client messages (full conversation history)
CREATE TABLE IF NOT EXISTS client_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id bigint,              -- Trainerize messageID
  thread_id bigint,               -- Trainerize threadID
  sender_id integer NOT NULL,     -- Who sent it
  body text,                      -- Full message text
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  sent_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_client_messages_thread ON client_messages (thread_id);
CREATE INDEX idx_client_messages_sender ON client_messages (sender_id);
CREATE INDEX idx_client_messages_sent ON client_messages (sent_at DESC);

-- 3. Workout completions (with comments and RPE)
CREATE TABLE IF NOT EXISTS workout_completions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id integer NOT NULL,
  daily_workout_id bigint,        -- Trainerize dailyWorkoutID
  comment text,                   -- Client's workout comment
  rpe integer,                    -- Rating of Perceived Exertion (1-10)
  completed_at timestamptz NOT NULL,
  payload jsonb,                  -- Full webhook data
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_workout_completions_client ON workout_completions (client_id);
CREATE INDEX idx_workout_completions_completed ON workout_completions (completed_at DESC);

-- 4. Body stat updates (weight, measurements, etc.)
CREATE TABLE IF NOT EXISTS body_stat_updates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id integer NOT NULL,
  stat_type text,                 -- 'weight', 'bodyFat', etc.
  value numeric,
  unit text,
  recorded_at timestamptz NOT NULL,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_body_stat_client ON body_stat_updates (client_id);
CREATE INDEX idx_body_stat_recorded ON body_stat_updates (recorded_at DESC);

-- 5. Enable Row Level Security (allow Edge Functions via service role)
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_stat_updates ENABLE ROW LEVEL SECURITY;

-- Service role policies (Edge Functions use service role key)
CREATE POLICY "Service role full access" ON webhook_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON client_messages
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON workout_completions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access" ON body_stat_updates
  FOR ALL USING (auth.role() = 'service_role');
