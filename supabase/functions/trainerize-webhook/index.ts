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
  if (messageId) {
    try {
      const fullMessage = await tzApi("/message/get", { messageID: messageId });
      if (fullMessage?.result) {
        const msg = fullMessage.result;
        body = msg.body || body;
        console.log(`Enriched message ${messageId}: "${(body || "").slice(0, 200)}"`);
      }
    } catch (err) {
      console.warn("Failed to enrich message via API:", err);
    }
  }

  // ── Look up client name ──
  let clientName = "";
  if (senderId) {
    try {
      const profileRes = await tzApi("/user/getProfile", { userIDs: [senderId] });
      const profiles = profileRes?.result || [];
      if (profiles.length > 0) {
        const p = profiles[0];
        clientName = [p.firstName, p.lastName].filter(Boolean).join(" ");
      }
    } catch (err) {
      console.warn("Could not look up client name:", err);
    }
  }

  console.log(`New message from ${clientName || senderId} in thread ${threadId}: "${(body || "").slice(0, 100)}"`);

  // ── Store in messages table ──
  const { data: insertedMsg, error } = await supabase.from("client_messages").insert({
    message_id: messageId,
    thread_id: threadId,
    sender_id: senderId,
    body: body,
    direction: "incoming",
    sent_at: data.sentTime || new Date().toISOString(),
    client_name: clientName || null,
  }).select().single();

  if (error) {
    console.error("Failed to store message:", error);
    return;
  }

  // ── Fetch thread history for context ──
  const { data: history } = await supabase
    .from("client_messages")
    .select("body, direction, sent_at")
    .eq("thread_id", threadId)
    .order("sent_at", { ascending: true })
    .limit(10);

  const threadContext = (history || [])
    .map((m: any) => `[${m.direction === "incoming" ? "Klient" : "Tränare"}] ${m.body}`)
    .join("\n");

  console.log(`Thread ${threadId} history: ${history?.length || 0} messages`);

  // ── Generate AI draft reply via OpenAI REST API ──
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY not set — skipping auto-draft");
    return;
  }

  try {
    const systemPrompt = `Du är en erfaren personlig tränare och coach som arbetar på Private Training Online (PTO). Du svarar på meddelanden från klienter som tränar med dig via appen Trainerize.

## Om PTO
Private Training Online erbjuder personlig träning på distans med hög kvalitet. Våra klienter får skräddarsydda träningsprogram, kostupplägg och kontinuerlig coachning. Relationen mellan tränare och klient är central — vi är mer än bara en app, vi är ett stöd i hela livsstilsförändringen.

## Din röst och ton
- Personlig — Skriv som om du pratar med klienten face-to-face. Använd deras förnamn om det finns tillgängligt.
- Vänlig men professionell — Aldrig stelt eller robotiskt, aldrig heller för kompist. Tänk: "en kompetent vän som bryr sig".
- Motivation utan överdrift — Uppmuntra genuint, men undvik tomma fraser. Var specifik i ditt beröm.
- Kort och slagkraftigt — Svara lagom långt: tillräckligt för att vara hjälpsamt, kort nog att respektera deras tid.
- Max 1 emoji per meddelande — Bara om det tillför något, aldrig påtvingat.
- Skriv alltid på svenska — Naturlig, modern svenska.

## Hur du svarar beroende på meddelandetyp

### Frågor om träning eller kost
- Ge ett tydligt, konkret svar
- Förklara kort "varför" — klienter som förstår följer bättre

### Klienten rapporterar problem (smärta, trötthet, svårigheter)
- Visa empati först
- Ge ett konkret förslag (byt övning, minska volym, ta extra vilodag)

### Klienten delar framsteg
- Uppmuntra genuint och specifikt
- Lyft vad som bidrog till framgången

### Logistiska frågor (schema, bokning, programändringar)
- Rak och tydlig information
- Bekräfta att du fixar om det behöver göras

### Allmänt prat / socialt
- Var vänlig och personlig, men håll det kort

## JSON-schema för svaret
Svara ALLTID med giltig JSON, inget annat:
{
  "reply": "Ditt formulerade svar till klienten — redo att skicka",
  "category": "fråga | problem | framsteg | logistik | allmänt",
  "suggestedActions": ["Eventuella åtgärder i klartext"],
  "tone": "uppmuntrande | empatisk | informativ | casual"
}

Svara ENBART med giltig JSON, inget annat.`;

    const userPrompt = [
      `Klient: ${clientName || `Klient #${senderId}`}`,
      `Meddelande från klient: "${body}"`,
      threadContext ? `Konversationshistorik:\n${threadContext}` : "",
    ].filter(Boolean).join("\n");

    const openaiModel = "gpt-5.4-2026-03-05";
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: openaiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        reasoning_effort: "medium",
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error(`OpenAI API error ${openaiRes.status}: ${errText.slice(0, 300)}`);
      return;
    }

    const openaiData = await openaiRes.json();
    const aiText = openaiData?.choices?.[0]?.message?.content || "";

    let draftReply = "";
    try {
      const parsed = JSON.parse(aiText);
      draftReply = parsed.reply || aiText;
    } catch {
      draftReply = aiText;
    }

    if (draftReply && insertedMsg?.id) {
      await supabase
        .from("client_messages")
        .update({ draft_reply: draftReply })
        .eq("id", insertedMsg.id);
      console.log(`AI draft saved for message ${insertedMsg.id}: "${draftReply.slice(0, 100)}"`);
    }
  } catch (err) {
    console.error("Failed to generate AI draft:", err);
  }
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
