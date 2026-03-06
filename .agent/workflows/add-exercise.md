---
description: Add a new exercise to a workout for a Trainerize client using AI suggestion
---

# Add Exercise Workflow

## Prerequisites
- `.env` must contain `TRAINERIZE_EMAIL`, `TRAINERIZE_PASSWORD`, `OPENAI_API_KEY`
- Node dependencies installed (`npm install`)
- Playwright browser available (`npx playwright install chromium` if needed)

## AI Model
- Configured via `OPENAI_CHAT_MODEL` in `.env` (default: `gpt-4.1-mini`)
- Change model: `.env` → `OPENAI_CHAT_MODEL=gpt-4.1` (higher quality) or `gpt-4o-mini` (speed/cost)

## How to Run

### Standard add (auto-approve)
// turbo
```bash
npx tsx src/index.ts add-exercise -c <CLIENT_EMAIL> -t "<DESCRIPTION>" -y
```

### With manual approval
```bash
npx tsx src/index.ts add-exercise -c <CLIENT_EMAIL> -t "<DESCRIPTION>"
```

### With explicit muscle group
// turbo
```bash
npx tsx src/index.ts add-exercise -c <CLIENT_EMAIL> -t "<DESCRIPTION>" -m brost -y
```

### Dry run (no changes saved)
// turbo
```bash
npx tsx src/index.ts add-exercise -c <CLIENT_EMAIL> -t "<DESCRIPTION>" -d
```

### Examples
```bash
# Swedish: add chest exercise
npx tsx src/index.ts add-exercise -c ekonomi@ptogroup.se -t "lägg till ny bröstövning" -y

# Swedish: add home core exercise  
npx tsx src/index.ts add-exercise -c ekonomi@ptogroup.se -t "lägg till en bra övning som jag träna hemma och som tränar magen" -y

# English: add heavy compound
npx tsx src/index.ts add-exercise -c client@example.com -t "add a heavy compound leg exercise" -y
```

## Pipeline Steps (10 steps, must execute in order)

### Step 1: Login (`session.ts`)
- Uses persistent Chromium profile at `tmp/trainerize-profile/`
- Skips login if cookies are valid

### Step 2: Find Client (`session.ts → openClientByEmailOrName`)
- Searches client grid with email, then last name, then first name
- Polls grid until ≤5 results (max 15s per query)
- Extracts `data-id` attribute as client ID

### Step 3: Navigate to Training Program (`runner.ts`)
- Direct URL: `/app/client/{clientId}/trainingProgram/`
- Uses `domcontentloaded` + polling for `[data-testid^="grid-row-"]` (up to 4s)
- Handles React redirect to `/trainingProgram/custom/trainingPhase/{phaseId}`

### Step 4: Extract Client Context (`runner.ts`)
- Scans page text for Goal/Mål and Notes/Anteckningar
- Passes to AI as context for exercise suggestion

### Step 5: AI Exercise Suggestion (`ai/replacement.ts → suggestExerciseToAdd`)
- Sends prompt to OpenAI with: user request, client goal, notes, muscle group
- Returns: replacementExercise, rationale, confidence, sets, reps, optimalPosition
- Muscle group auto-detected from request text via `inferMuscleGroup()`

### Step 6: Find Matching Workout (`runner.ts`)
- Collects workout info via `page.evaluate` (names + URLs)
- Matches workout by muscle group keywords (Swedish + English)
- **Fallback**: uses first available workout if no muscle-group match

### Step 7: Approval (`checkpoint.ts`)
- `-y` flag: auto-approve
- Shows diff preview: `WorkoutName: + ExerciseName (SetsxReps)`

### Step 8: Execute Addition (`flows/replace-exercise.ts + runner.ts`)
- **8a Navigate**: `page.goto(workoutUrl)` to the matched workout
- **8b Open Workout Builder**: Click pen icon → select "Workout Builder"
- **8c Search**: Type exercise name in library search
- **8d Add**: Click best-matching card → "ADD TO WORKOUT"
- **8e Verify**: Confirm exercise appears in workout list

### Step 9: Configure Sets/Reps (`flows/replace-exercise.ts → setSetsReps`)
- Uses `data-testid="workoutBuilder-exerciseSetInput"` for sets
- Uses `data-testid="workoutBuilder-recordTypeInput"` for reps/target
- Walks up DOM (max 5 levels) to find exercise row container
- Non-fatal: pipeline continues even if this step fails

### Step 10: Reorder + Save (`runner.ts`)
- Reorder exercise to AI-suggested `optimalPosition` (drag-and-drop)
- Save via 3-strategy cascade: locator → getByText → evaluate fallback

## Key CSS Selectors (verified 2026-03-03)

| Purpose | Selector | File |
|---------|----------|------|
| Training program rows | `[data-testid^="grid-row-"]` | `runner.ts` |
| Workout names | `[data-testid^="workoutGrid-workoutName"]` | `runner.ts` |
| Workout links | `a[href*="/workout/"]` | `runner.ts` |
| Exercise checkbox | `[data-testid="workoutBuilder-exerciseCheckbox"]` | `replace-exercise.ts` |
| Sets input | `[data-testid="workoutBuilder-exerciseSetInput"]` | `replace-exercise.ts` |
| Reps/Target input | `[data-testid="workoutBuilder-recordTypeInput"]` | `replace-exercise.ts` |
| Exercise library cards | `.exerciseLibrary-exercise` | `replace-exercise.ts` |

## Muscle Groups Supported

| Group | Keywords (EN + SV) |
|-------|-------------------|
| ben | squat, leg, lunge, deadlift, knäböj |
| brost | bench, chest, fly, bänk, **bröst**, **brost** |
| rygg | row, back, pull, lat, rodd |
| axlar | shoulder, lateral, raise, axel |
| biceps | curl, hammer, preacher, bicep |
| triceps | extension, pushdown, skullcrusher, dip, tricep |
| mage | core, abs, crunch, plank, **mage** |
| helkropp | *(default fallback)* |

## Troubleshooting

- **"no workouts found"**: Training program page didn't load grid rows — check if client has an active training phase
- **"exercise row not found"**: Exercise not in Trainerize library — try a different name
- **setSetsReps fails**: Non-fatal, exercise still added. Check if UI structure changed
- **Muscle group wrong**: Use `-m <group>` flag to override auto-detection
- **Wrong workout selected**: Override muscle group or manually check workout names
