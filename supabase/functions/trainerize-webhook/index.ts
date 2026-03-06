// Supabase Edge Function: Trainerize Webhook Receiver
// Receives webhook events from Trainerize and stores them in the database.
// Validates security key header, enriches messages via getMessage API.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("TRAINERIZE_WEBHOOK_SECRET") || "";

// Trainerize API credentials
const TZ_GROUP_ID = "11613";
const TZ_API_TOKEN = Deno.env.get("TRAINERIZE_API_TOKEN") || "";
const TZ_BASE_URL = "https://api.trainerize.com/v03";
const TZ_AUTH = `Basic ${btoa(`${TZ_GROUP_ID}:${TZ_API_TOKEN}`)}`;
const TZ_TRAINER_ID = 4452827; // PTO trainer account

// ── Trainerize API helper ──
async function tzApi(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(`${TZ_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { Authorization: TZ_AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Security key validation ──
// Jason confirmed key: e5b1bad5bfb040a4889410051ac67819
// We don't know the exact header name yet, so we check multiple candidates
// and log all headers on first webhook to determine the correct one.
function validateSecurityKey(req: Request): { valid: boolean; keyHeader?: string } {
  if (!WEBHOOK_SECRET) return { valid: true }; // Skip if no secret configured

  // Check common header names Trainerize might use
  const candidates = [
    "x-security-key",
    "x-webhook-secret",
    "x-trainerize-signature",
    "x-webhook-signature",
    "authorization",
    "x-api-key",
    "security-key",
  ];

  for (const header of candidates) {
    const value = req.headers.get(header);
    if (value === WEBHOOK_SECRET) {
      return { valid: true, keyHeader: header };
    }
  }

  // If none matched, check if ANY header contains the secret (discovery mode)
  const allHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    allHeaders[key] = value;
    if (value === WEBHOOK_SECRET) {
      console.log(`🔑 Security key found in header: "${key}"`);
      return; // We'll still log all headers for debugging
    }
  });

  // Log ALL headers so we can identify the correct one from Supabase logs
  console.log("📋 All incoming headers:", JSON.stringify(allHeaders));

  // In discovery mode: accept all requests but log the mismatch
  // Once we know the correct header, we can tighten this
  console.warn("⚠️ Security key not found in expected headers — accepting in discovery mode");
  return { valid: true, keyHeader: "discovery-mode" };
}

// ── Main handler ──
Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Validate security key
    const { valid, keyHeader } = validateSecurityKey(req);
    if (!valid) {
      console.error("❌ Invalid webhook security key");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (keyHeader) {
      console.log(`✅ Security key validated via header: ${keyHeader}`);
    }

    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);
    const eventType = payload.event || payload.type || payload.eventType || "unknown";

    console.log(`📨 Webhook: ${eventType}`, JSON.stringify(payload).slice(0, 500));

    // Initialize Supabase client with service role (full access)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Extract client ID from payload ──
    const clientId = payload.data?.userID ||
      payload.data?.clientID ||
      payload.data?.senderID ||
      payload.userID ||
      null;

    // ── Store the raw webhook event ──
    const { data: insertedEvent, error: insertError } = await supabase
      .from("webhook_events")
      .insert({
        event_type: eventType,
        payload: payload,
        client_id: clientId,
        processed: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to store webhook event:", insertError);
    } else {
      console.log(`Stored event ${insertedEvent.id} (${eventType})`);
    }

    // ── Handle specific event types ──

    if (eventType === "message.new" || eventType === "message.created") {
      await handleNewMessage(supabase, payload);
    }

    if (eventType === "dailyWorkout.completed" || eventType === "workout.completed") {
      await handleWorkoutCompleted(supabase, payload);
    }

    if (eventType === "bodyStat.added" || eventType === "bodyStat.updated") {
      await handleBodyStat(supabase, payload);
    }

    // Mark event as processed
    if (insertedEvent?.id) {
      await supabase
        .from("webhook_events")
        .update({ processed: true })
        .eq("id", insertedEvent.id);
    }

    return new Response(JSON.stringify({ success: true, eventType }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook processing error:", err);
    // Return 200 even on error to prevent Trainerize from retrying endlessly
    return new Response(JSON.stringify({ success: true, error: "processed with errors" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ══════════════════════════════════════════════════════════════
// Event Handlers
// ══════════════════════════════════════════════════════════════

async function handleNewMessage(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const data = (payload.data || payload) as Record<string, unknown>;
  const messageId = data.messageID as number;
  const threadId = data.threadID as number;
  const senderId = data.senderID as number;
  let body = data.body as string;

  // ── Enrich via getMessage API ──
  // Webhook payload might not have full message text, so fetch it
  if (messageId) {
    try {
      const fullMessage = await tzApi("/message/get", { messageID: messageId });
      if (fullMessage?.result) {
        const msg = fullMessage.result;
        body = msg.body || body;
        console.log(`📩 Enriched message ${messageId}: "${(body || "").slice(0, 200)}"`);
      }
    } catch (err) {
      console.warn("Failed to enrich message via API:", err);
    }
  }

  console.log(`💬 New message from ${senderId} in thread ${threadId}: "${(body || "").slice(0, 100)}"`);

  // Store in messages table for conversation history
  const { error } = await supabase.from("client_messages").insert({
    message_id: messageId,
    thread_id: threadId,
    sender_id: senderId,
    body: body,
    direction: "incoming",
    sent_at: data.sentTime || new Date().toISOString(),
  });

  if (error) {
    console.error("Failed to store message:", error);
  }

  // Fetch recent conversation history from our DB (for future AI use)
  const { data: history } = await supabase
    .from("client_messages")
    .select("body, direction, sent_at")
    .eq("thread_id", threadId)
    .order("sent_at", { ascending: false })
    .limit(10);

  console.log(`📚 Thread ${threadId} history: ${history?.length || 0} messages`);

  // TODO: Generate AI response when ready
  // const aiResponse = await generateAIResponse(body, context);
  // await tzApi("/message/reply", {
  //   threadID: threadId,
  //   userID: TZ_TRAINER_ID,
  //   body: aiResponse,
  //   type: "text",
  // });
  // await supabase.from("client_messages").insert({
  //   message_id: null,
  //   thread_id: threadId,
  //   sender_id: TZ_TRAINER_ID,
  //   body: aiResponse,
  //   direction: "outgoing",
  //   sent_at: new Date().toISOString(),
  // });
}

async function handleWorkoutCompleted(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const data = (payload.data || payload) as Record<string, unknown>;
  const clientId = data.userID as number;
  const workoutId = data.dailyWorkoutID as number;

  console.log(`🏋️ Workout completed: client ${clientId}, workout ${workoutId}`);

  const { error } = await supabase.from("workout_completions").insert({
    client_id: clientId,
    daily_workout_id: workoutId,
    comment: data.comment as string,
    rpe: data.rpe as number,
    completed_at: data.completedAt || new Date().toISOString(),
    payload: data,
  });

  if (error) {
    console.error("Failed to store workout completion:", error);
  }
}

async function handleBodyStat(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const data = (payload.data || payload) as Record<string, unknown>;
  const clientId = data.userID as number;

  console.log(`📊 Body stat update: client ${clientId}`);

  const { error } = await supabase.from("body_stat_updates").insert({
    client_id: clientId,
    stat_type: data.type as string,
    value: data.value as number,
    unit: data.unit as string,
    recorded_at: data.date || new Date().toISOString(),
    payload: data,
  });

  if (error) {
    console.error("Failed to store body stat:", error);
  }
}
