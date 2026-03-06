---
description: Replace an exercise in all matching workouts for a Trainerize client
---

# Replace Exercise Workflow

## Prerequisites
- `.env` must contain `TRAINERIZE_EMAIL`, `TRAINERIZE_PASSWORD`, `OPENAI_API_KEY`
- Node dependencies installed (`npm install`)
- Playwright browser available (`npx playwright install chromium` if needed)

## AI Model
- Configured via `OPENAI_CHAT_MODEL` in `.env` (default: `gpt-4.1-mini`)
- Used in two places: intent parsing (`intent-parser.ts`) and replacement suggestion (`replacement.ts`)
- Change model by editing `.env` → `OPENAI_CHAT_MODEL=gpt-4.1` (for higher quality) or `gpt-4o-mini` (for speed/cost)

## How to Run

### Standard replace (auto-approve)
// turbo
```bash
npx tsx src/index.ts replace-exercise -c <CLIENT_EMAIL> -e "<EXERCISE_NAME>" -y
```

### With manual approval (review diff before applying)
```bash
npx tsx src/index.ts replace-exercise -c <CLIENT_EMAIL> -e "<EXERCISE_NAME>"
```

### Dry run (no changes saved)
// turbo
```bash
npx tsx src/index.ts replace-exercise -c <CLIENT_EMAIL> -e "<EXERCISE_NAME>" -d
```

### Via API
```bash
curl -X POST http://localhost:3847/api/tasks/replace-exercise \
  -H "Content-Type: application/json" \
  -d '{"clientEmail":"<EMAIL>","taskDescription":"replace <EXERCISE>","autoApprove":true}'
```

## Pipeline Steps (10 steps, must execute in order)

The following describes what each step does. DO NOT change the order or skip steps.

### Step 1: Login (`session.ts`)
- Uses persistent Chromium profile at `tmp/trainerize-profile/`
- Skips login if cookies are valid
- Fills `#emailInput` + `#passInput` if login page shown

### Step 2: Find Client (`session.ts → openClientByEmailOrName`)
- Searches client grid with email, then last name, then first name
- Polls grid until ≤5 results (max 15s per query)
- Extracts `data-id` attribute as client ID

### Step 3: Navigate to Training Program (`runner.ts`)
- Direct URL: `/app/client/{clientId}/trainingProgram/`
- Polls for `[data-testid^="grid-row-"]` up to 4s

### Step 4: Extract Client Context (`runner.ts`)
- Scans page text for Goal/Mål and Notes/Anteckningar
- Passes to AI as context for replacement suggestion

### Step 5: AI Replacement Suggestion (`ai/replacement.ts`)
- Sends prompt to OpenAI with: target exercise, client goal, notes, muscle group
- Returns: replacementExercise, rationale, confidence, sets, reps, optimalPosition
- JSON parsing has 3-layer fallback (direct → regex extract → field-by-field)
- Delete-only mode: triggered by keywords like "ingen ersättning", "no replacement"

### Step 6: Find Exercise in Workouts (`runner.ts`)
- Scans workout rows for target exercise (tooltips + text content)
- If found in tooltip: navigates directly to that workout
- Fallback: clicks into each workout to scan body text

### Step 7: Guardrails (`guardrails.ts`)
- MUST pass all checks before any write operation:
  - Client was found
  - Exercise exists in at least one workout
  - At least one matching workout
- Warning if >5 workouts affected

### Step 8: Diff Preview (`diff.ts`)
- Builds `before → after (sets×reps)` summary for each affected workout

### Step 9: Approval (`checkpoint.ts`)
- `-y` flag: auto-approve
- Confidence < 0.6: requires typing "YES" (not just Y)
- Dry run: always auto-approved

### Step 10: Execute Replacement (`flows/replace-exercise.ts` + `runner.ts`)
- **10a Delete**: Check exercise checkbox → wait for delete button → click → verify count decreased
- **10b Add**: Search exercise library → find best match → click card → "ADD TO WORKOUT"
- **10c Sets/Reps**: Call `setSetsReps()` with AI-suggested values
- **10d Reorder**: Drag exercise to optimalPosition (if provided)
- **10e Save**: Click SAVE button (3 strategies: locator, getByText, evaluate fallback)

## Key CSS Selectors (verified 2026-03-03)

These selectors are critical for stability. If Trainerize changes their UI, update these:

| Purpose | Selector | File |
|---------|----------|------|
| Client grid items | `.trGrid-item[data-id]` | `session.ts` |
| Training program rows | `[data-testid^="grid-row-"]` | `runner.ts` |
| Workout names | `[data-testid^="workoutGrid-workoutName"]` | `runner.ts` |
| Exercise rows | `.workoutExercise` | `replace-exercise.ts` |
| Exercise checkbox | `[data-testid="workoutBuilder-exerciseCheckbox"]` | `replace-exercise.ts` |
| Sets input | `[data-testid="workoutBuilder-exerciseSetInput"]` | `replace-exercise.ts` |
| Reps/Target input | `[data-testid="workoutBuilder-recordTypeInput"]` | `replace-exercise.ts` |
| Delete button | `[data-testid="workoutBuilder-deleteBtn"]` | `replace-exercise.ts` |
| Exercise library cards | `.exerciseLibrary-exercise` | `replace-exercise.ts` |
| Drag handle | `.hamburger-anker` | `replace-exercise.ts` |

## Muscle Groups Supported

| Group | Keywords (EN + SV) |
|-------|--------------------|
| ben | squat, leg, lunge, deadlift, knäböj |
| brost | bench, chest, fly, bänk, **bröst**, **brost** |
| rygg | row, back, pull, lat, rodd |
| axlar | shoulder, lateral, raise, axel |
| biceps | curl, hammer, preacher, bicep |
| triceps | extension, pushdown, skullcrusher, dip, tricep |
| mage | core, abs, crunch, plank |

## Troubleshooting

- **"client not found"**: Check email spelling, or try with client's last name
- **"exercise not found"**: The exercise must exist in the client's current program
- **"delete button disabled"**: Checkbox click may have failed (modal overlay issue)
- **"ADD TO WORKOUT not found"**: Exercise detail modal may not have loaded
- **Save fails silently**: Check post-save state logs for `modalStillOpen`
