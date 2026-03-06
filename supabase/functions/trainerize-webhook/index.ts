// Supabase Edge Function: Trainerize Webhook Receiver
// Receives webhook events from Trainerize and stores them in the database.
// For message events, it can optionally trigger an AI-powered auto-reply.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("TRAINERIZE_WEBHOOK_SECRET") || "";

// Trainerize API credentials
const TZ_GROUP_ID = "11613";
const TZ_API_TOKEN = Deno.env.get("TRAINERIZE_API_TOKEN") || "0nC1ptkUms0NGJJIWw";
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

// ── Verify webhook signature (if Trainerize provides one) ──
function verifySignature(body: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) return true; // Skip if no secret configured
  // TODO: Implement HMAC verification when Trainerize confirms their signing method
  return true;
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
    const rawBody = await req.text();
    const signature = req.headers.get("x-trainerize-signature") ||
      req.headers.get("x-webhook-signature");

    // Verify signature
    if (!verifySignature(rawBody, signature)) {
      console.error("Invalid webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.event || payload.type || payload.eventType || "unknown";

    console.log(`Received webhook: ${eventType}`, JSON.stringify(payload).slice(0, 500));

    // Initialize Supabase client with service role (full access)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Extract client ID from payload ──
    const clientId = payload.data?.userID ||
      payload.data?.clientID ||
      payload.data?.senderID ||
      payload.userID ||
      null;

    // ── Store the webhook event ──
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
      // Still return 200 so Trainerize doesn't retry
    } else {
      console.log(`Stored event ${insertedEvent.id} (${eventType})`);
    }

    // ── Handle specific event types ──

    // MESSAGE: New message from client
    if (eventType === "message.new" || eventType === "message.created") {
      await handleNewMessage(supabase, payload);
    }

    // WORKOUT COMPLETED: Client finished a workout
    if (eventType === "dailyWorkout.completed" || eventType === "workout.completed") {
      await handleWorkoutCompleted(supabase, payload);
    }

    // BODY STAT: Client logged weight/measurements
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
  const body = data.body as string;

  console.log(`New message from client ${senderId}: "${(body || "").slice(0, 100)}"`);

  // Store in messages table for conversation history
  await supabase.from("client_messages").insert({
    message_id: messageId,
    thread_id: threadId,
    sender_id: senderId,
    body: body,
    direction: "incoming",
    sent_at: data.sentTime || new Date().toISOString(),
  });

  // Fetch client context for AI response
  const clientProfile = await tzApi("/user/get", { id: senderId });
  const calendar = await tzApi("/calendar/getList", {
    userID: senderId,
    startDate: getDateOffset(-7),
    endDate: getDateOffset(14),
  });

  // Fetch recent conversation history from our DB
  const { data: history } = await supabase
    .from("client_messages")
    .select("body, direction, sent_at")
    .eq("thread_id", threadId)
    .order("sent_at", { ascending: false })
    .limit(10);

  // TODO: Generate AI response using the context
  // For now, log the context and let the trainer handle manually
  console.log("Client context gathered:", {
    name: `${clientProfile?.firstName} ${clientProfile?.lastName}`,
    message: body,
    historyCount: history?.length || 0,
    upcomingWorkouts: (calendar?.calendar || []).filter(
      (d: Record<string, unknown>) => (d.items as unknown[])?.length > 0,
    ).length,
  });

  // UNCOMMENT when ready for auto-reply:
  // const aiResponse = await generateAIResponse(body, clientProfile, history, calendar);
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

  console.log(`Workout completed: client ${clientId}, workout ${workoutId}`);

  // Store completion data including comments and RPE (if provided in webhook)
  await supabase.from("workout_completions").insert({
    client_id: clientId,
    daily_workout_id: workoutId,
    comment: data.comment as string,
    rpe: data.rpe as number,
    completed_at: data.completedAt || new Date().toISOString(),
    payload: data,
  });
}

async function handleBodyStat(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const data = (payload.data || payload) as Record<string, unknown>;
  const clientId = data.userID as number;

  console.log(`Body stat update: client ${clientId}`);

  await supabase.from("body_stat_updates").insert({
    client_id: clientId,
    stat_type: data.type as string,
    value: data.value as number,
    unit: data.unit as string,
    recorded_at: data.date || new Date().toISOString(),
    payload: data,
  });
}

// ── Utility ──
function getDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
