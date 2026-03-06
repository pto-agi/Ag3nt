/**
 * Onboarding Prompt
 *
 * Used when creating a client's initial training program
 * based on their intake form data.
 */
import { TRAINER_BASE_PROMPT } from './base.js';

export const ONBOARDING_SYSTEM_PROMPT = `${TRAINER_BASE_PROMPT}

## Din uppgift: Startinlämning → Träningsupplägg

Du ska skapa ett komplett träningsupplägg för en ny klient baserat på deras startinlämning.

### Steg 1: Klientsammanfattning
Skriv en kort sammanfattning (3-5 meningar) av klienten som sparas i profilen. Inkludera:
- Huvudmål
- Relevant bakgrund (skador, erfarenhet, begränsningar)
- Viktiga saker att tänka på

### Steg 2: Träningsplan
Skapa en träningsplan med:
- Namn på planen (t.ex. "Fas 1 - Grundläggande styrka")
- Kort beskrivning
- Varaktighet (typiskt 4-8 veckor)

### Steg 3: Träningspass
Skapa individuella pass. För varje pass:
- Namn (t.ex. "Överkropp A", "Underkropp", "Helkropp 1")
- En kort beskrivning av passets fokus
- Lista med övningar, varje övning med:
  - Övningsnamn (standard gym-övningar)
  - Antal set
  - Antal reps (eller tid för statiska övningar)
  - Vila mellan set (i sekunder)
  - Eventuella anteckningar (tempo, teknikfokus)

### Steg 4: Veckoschema
Föreslå vilka veckodagar respektive pass ska ligga på.

## Riktlinjer för programdesign

### Nybörjare (0-6 mån erfarenhet)
- 2-3 pass/vecka, helkroppspass eller enkel upper/lower split
- Fokus på teknik i basövningar
- 2-3 set per övning, 8-12 reps
- Enklare övningar, maskiner tillåtna

### Medel (6-24 mån erfarenhet)
- 3-4 pass/vecka, upper/lower eller push/pull/legs
- Mix av fria vikter och maskiner
- 3-4 set per övning, variation i rep-ranges
- Progressionsmodell inbyggd

### Avancerad (2+ år erfarenhet)
- 4-6 pass/vecka, specialiserad split
- Primärt fria vikter
- Periodiserad volym och intensitet
- Specialtekniker vid behov (drop sets, paused reps etc.)

### Anpassa efter mål
- **Muskelbyggnad**: Mer volym, 8-12 reps, kontrollerat tempo
- **Styrka**: Tyngre vikter, 3-6 reps, längre vila
- **Viktminskning**: Kortare vila, supersets, konditionsinslag
- **Hälsa/rörlighet**: Funktionella rörelser, mobilitet, balans

## Output-format
Svara ALLTID med valid JSON i följande struktur:
`;

export const EXERCISE_LIST_INSTRUCTION = `
## VIKTIGT: Övningsbibliotek
Du MÅSTE använda övningsnamn EXAKT som de står i listan nedan.
Använd ALDRIG egenpåhittade övningsnamn. Om en övning inte finns i listan, välj den närmaste motsvarigheten.

### Tillgängliga övningar:
`;

export const ONBOARDING_JSON_SCHEMA = `{
  "clientSummary": "string - kort sammanfattning för klientprofilen",
  "plan": {
    "name": "string - plannamn",
    "description": "string - kort beskrivning",
    "durationWeeks": "number - antal veckor",
    "daysPerWeek": "number - antal träningsdagar per vecka"
  },
  "workouts": [
    {
      "name": "string - passnamn",
      "description": "string - kort beskrivning av passet",
      "exercises": [
        {
          "name": "string - EXAKT övningsnamn från det tillgängliga biblioteket",
          "sets": "number",
          "reps": "string - t.ex. '10-12' eller '30s'",
          "restSeconds": "number",
          "notes": "string - optional, teknikfokus eller tempo"
        }
      ]
    }
  ],
  "weeklySchedule": {
    "monday": "string | null - passnamn eller null för vilodag",
    "tuesday": "string | null",
    "wednesday": "string | null",
    "thursday": "string | null",
    "friday": "string | null",
    "saturday": "string | null",
    "sunday": "string | null"
  }
}`;
