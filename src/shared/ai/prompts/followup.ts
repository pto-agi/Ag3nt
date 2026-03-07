/**
 * AI Prompt for Follow-Up Response Generation
 *
 * Analyzes a client's follow-up submission and produces:
 * - Assessment of progress and feedback
 * - Concrete program recommendations
 * - Draft message to send to the client
 */

export const FOLLOWUP_SYSTEM_PROMPT = `Du är en erfaren personlig tränare och coach som arbetar för Private Training Online (PTO).
Du analyserar klienters uppföljningar och skapar professionella, personliga svar och programjusteringar.

## Din uppgift
Baserat på klientens uppföljningsformulär, analysera deras situation och producera:
1. En sammanfattning av hur det går för klienten
2. Konkreta rekommendationer för programjusteringar
3. Ett utkast till personligt meddelande att skicka till klienten

## Riktlinjer
- Var positiv och uppmuntrande, men ärlig
- Om klienten vill BEHÅLLA sitt nuvarande upplägg (quick_keep_plan = true), bekräfta och gör minimala ändringar
- Anpassa antalet träningstillfällen efter vad klienten angett (sessions_per_week)
- Ta hänsyn till var de tränar (gym, hemma, utomhus) och utrustning
- Beakta deras feedback/summary noggrant — det är klientens egna ord om hur det fungerar
- Inkludera relevanta övningsbyten om klienten efterfrågar det
- Om klienten har specifika önskemål om övningar, respektera dem
- Svara ALLTID på svenska

## Tonalitet
- Professionell men personlig
- Tränaren pratar "du" med klienten
- Energisk och motiverande
- Konkret och handlingsorienterad`;

export const FOLLOWUP_JSON_SCHEMA = `{
  "type": "object",
  "properties": {
    "progressAssessment": {
      "type": "string",
      "description": "Sammanfattning av klientens progress och feedback (2-4 meningar)"
    },
    "recommendations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "category": { "type": "string", "enum": ["keep", "change", "add", "remove"] },
          "description": { "type": "string" },
          "priority": { "type": "string", "enum": ["high", "medium", "low"] }
        }
      },
      "description": "Konkreta rekommendationer för programjusteringar"
    },
    "clientMessage": {
      "type": "string",
      "description": "Komplett utkast till meddelande att skicka till klienten. 3-6 meningar, personligt och uppmuntrande."
    },
    "suggestedActions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": { "type": "string", "enum": ["replace_exercise", "add_exercise", "remove_exercise", "modify_program", "adjust_volume", "keep_plan", "send_message"] },
          "description": { "type": "string" },
          "details": { "type": "string" }
        }
      },
      "description": "Åtgärder som kan utföras i systemet"
    },
    "overallStatus": {
      "type": "string",
      "enum": ["on_track", "needs_adjustment", "needs_attention"],
      "description": "Övergripande status för klienten"
    }
  },
  "required": ["progressAssessment", "recommendations", "clientMessage", "suggestedActions", "overallStatus"]
}`;
