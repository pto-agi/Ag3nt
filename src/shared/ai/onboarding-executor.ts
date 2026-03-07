/**
 * Onboarding Executor
 *
 * Takes an AI-generated OnboardingResult and creates everything in Trainerize:
 * 1. Match exercise names → Trainerize exercise IDs (via cache)
 * 2. Create training plan
 * 3. Create workout definitions with matched exercises
 * 4. Schedule workouts based on weekly schedule
 * 5. Add trainer note with client summary
 */
import { OnboardingResult } from './ai-trainer.js';
import { searchExerciseByName } from '../integrations/exercise-cache.js';
import {
    addTrainingPlan,
    addWorkoutDef,
    getWorkoutDef,
    scheduleDailyWorkout,
    addTrainerNote,
} from '../integrations/trainerize-api.js';
import { logger } from '../logger.js';

// ── Types ──

export interface ExecuteOnboardingInput {
    clientId: number;
    trainerId: number;
    clientEmail?: string;
    onboardingResult: OnboardingResult;
}

export interface ExecuteStep {
    step: string;
    status: 'ok' | 'error' | 'skipped';
    detail?: string;
    data?: unknown;
}

export interface ExecuteOnboardingOutput {
    ok: boolean;
    steps: ExecuteStep[];
    trainingPlanId?: number;
    workoutDefIds: number[];
    errors: string[];
}

// Day name mapping (AI output keys → ISO day numbers for scheduling)
const DAY_MAP: Record<string, number> = {
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
    friday: 5, saturday: 6, sunday: 0,
};

// ── Main Executor ──

export async function executeOnboarding(input: ExecuteOnboardingInput): Promise<ExecuteOnboardingOutput> {
    const { clientId, trainerId, onboardingResult: plan } = input;
    const log = logger.child({ step: 'onboarding-executor', clientId });

    const steps: ExecuteStep[] = [];
    const errors: string[] = [];
    const workoutDefIds: number[] = [];
    let trainingPlanId: number | undefined;

    log.info({ planName: plan.plan.name, workouts: plan.workouts.length }, 'Starting onboarding execution');

    // ── Step 1: Match exercise names → IDs ──
    log.info('Resolving exercise names to Trainerize IDs...');
    const exerciseMap = new Map<string, { id: number; exactName: string }>();
    const missedExercises: string[] = [];

    const allExerciseNames = plan.workouts.flatMap(w => w.exercises.map(e => e.name));
    const uniqueNames = [...new Set(allExerciseNames)];

    for (const name of uniqueNames) {
        const match = await searchExerciseByName(name);
        if (match) {
            exerciseMap.set(name, { id: match.id, exactName: match.name });
        } else {
            missedExercises.push(name);
        }
    }

    steps.push({
        step: 'Matcha övningsnamn',
        status: missedExercises.length > 0 ? 'error' : 'ok',
        detail: `${exerciseMap.size}/${uniqueNames.length} matchade` +
            (missedExercises.length > 0 ? `. Ej hittade: ${missedExercises.join(', ')}` : ''),
    });

    if (missedExercises.length > 0) {
        log.warn({ missed: missedExercises }, 'Some exercises not found in library');
        errors.push(`Övningar ej hittade: ${missedExercises.join(', ')}`);
    }

    // ── Step 2: Create training plan ──
    try {
        const today = new Date().toISOString().split('T')[0];
        const planRes = await addTrainingPlan(clientId, {
            name: plan.plan.name,
            instruction: plan.plan.description,
            startDate: today,
            duration: plan.plan.durationWeeks,
            durationType: 'week',
        }) as any;
        const planData = planRes?.data || planRes;
        trainingPlanId = planData?.plan?.id || planData?.id;
        steps.push({
            step: 'Skapa träningsplan',
            status: 'ok',
            detail: `"${plan.plan.name}" (ID: ${trainingPlanId})`,
            data: { id: trainingPlanId },
        });
        log.info({ planId: trainingPlanId, name: plan.plan.name }, 'Training plan created');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        steps.push({ step: 'Skapa träningsplan', status: 'error', detail: msg });
        errors.push(`Kunde inte skapa träningsplan: ${msg}`);
        log.error({ err: msg }, 'Failed to create training plan');
    }

    // ── Step 3: Create workout definitions ──
    for (const workout of plan.workouts) {
        try {
            const exercises = workout.exercises
                .filter(ex => exerciseMap.has(ex.name)) // Skip unmatched exercises
                .map(ex => {
                    const match = exerciseMap.get(ex.name)!;
                    return {
                        def: {
                            id: match.id,
                            sets: ex.sets,
                            target: ex.reps,
                            restTime: ex.restSeconds,
                            recordType: 'Strength',
                            supersetType: 'none',
                            superSetID: 0,
                            side: null,
                        },
                    };
                });

            if (exercises.length === 0) {
                steps.push({
                    step: `Skapa pass: ${workout.name}`,
                    status: 'skipped',
                    detail: 'Inga matchande övningar',
                });
                continue;
            }

            const addOptions: Parameters<typeof addWorkoutDef>[0] = {
                workoutDef: {
                    name: workout.name,
                    type: 'workoutRegular',
                    instructions: workout.description,
                    exercises,
                },
            };

            // Attach to training plan if we have one
            if (trainingPlanId) {
                addOptions.type = 'trainingPlan';
                addOptions.trainingPlanID = trainingPlanId;
                addOptions.userID = clientId;
            } else {
                addOptions.type = 'mine';
            }

            const wRes = await addWorkoutDef(addOptions) as any;
            const wData = wRes?.data || wRes;
            const defId = wData?.workoutDef?.id || wData?.id;
            if (defId) workoutDefIds.push(defId);

            steps.push({
                step: `Skapa pass: ${workout.name}`,
                status: 'ok',
                detail: `${exercises.length} övningar (ID: ${defId})`,
                data: { id: defId, exercises: exercises.length },
            });
            log.info({ workoutName: workout.name, exercises: exercises.length, defId }, 'Workout created');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            steps.push({ step: `Skapa pass: ${workout.name}`, status: 'error', detail: msg });
            errors.push(`Kunde inte skapa pass "${workout.name}": ${msg}`);
            log.error({ workoutName: workout.name, err: msg }, 'Failed to create workout');
        }
    }

    // ── Step 4: Schedule workouts via weekly schedule ──
    if (plan.weeklySchedule && workoutDefIds.length > 0) {
        try {
            const today = new Date();
            // Find the next Monday as start of scheduled week
            const currentDay = today.getDay();
            const daysUntilMonday = currentDay === 0 ? 1 : (8 - currentDay);
            const startDate = new Date(today);
            startDate.setDate(today.getDate() + daysUntilMonday);

            // Map workout names to their created IDs
            const workoutNameToId = new Map<string, number>();
            plan.workouts.forEach((w, i) => {
                if (workoutDefIds[i]) {
                    workoutNameToId.set(w.name, workoutDefIds[i]);
                }
            });

            // Fetch full workout definitions (required by dailyWorkout/set API)
            log.info({ ids: workoutDefIds }, 'Fetching full workout defs for scheduling...');
            let fullWorkoutDefs: Record<string, any> = {};
            try {
                const wdRes = await getWorkoutDef(workoutDefIds) as any;
                const wdData = wdRes?.data || wdRes;
                const defList = wdData?.result || wdData?.workoutDefs || [];
                for (const wd of (Array.isArray(defList) ? defList : [])) {
                    if (wd?.id) fullWorkoutDefs[wd.id] = wd;
                }
                log.info({ fetched: Object.keys(fullWorkoutDefs).length }, 'Fetched workout defs');
            } catch (err) {
                log.warn({ err: err instanceof Error ? err.message : String(err) }, 'Could not fetch workout defs — will try minimal format');
            }

            const dailyWorkouts: Array<Record<string, unknown>> = [];

            for (const [dayName, workoutName] of Object.entries(plan.weeklySchedule)) {
                if (!workoutName || workoutName === 'null' || workoutName === 'Vila') continue;

                const dayNum = DAY_MAP[dayName];
                if (dayNum === undefined) continue;

                const defId = workoutNameToId.get(workoutName);
                if (!defId) continue;

                // Calculate the date for this day of the week
                const scheduleDate = new Date(startDate);
                const dayOffset = dayNum === 0 ? 6 : dayNum - 1; // Mon=0 offset
                scheduleDate.setDate(startDate.getDate() + dayOffset);

                const dateStr = scheduleDate.toISOString().split('T')[0];

                // Build the full daily workout object
                const fullDef = fullWorkoutDefs[defId];
                if (fullDef) {
                    // Full format — pass the complete workoutDef
                    dailyWorkouts.push({
                        date: dateStr,
                        clientID: clientId,
                        workoutDef: {
                            ...fullDef,
                            id: 0,  // Set to 0 to create new instance
                        },
                    });
                } else {
                    // Minimal fallback — try with just the ID reference
                    dailyWorkouts.push({
                        date: dateStr,
                        clientID: clientId,
                        workoutDefID: defId,
                        workoutDef: {
                            id: defId,
                        },
                    });
                }
            }

            if (dailyWorkouts.length > 0) {
                log.info({ count: dailyWorkouts.length, startDate: startDate.toISOString().split('T')[0] }, 'Scheduling workouts...');
                const schedResult = await scheduleDailyWorkout({ userID: trainerId, dailyWorkouts }) as any;
                log.info({ result: JSON.stringify(schedResult).slice(0, 500) }, 'Schedule result');
                steps.push({
                    step: 'Schemalägg vecka',
                    status: 'ok',
                    detail: `${dailyWorkouts.length} pass schemalagda fr.o.m. ${startDate.toISOString().split('T')[0]}`,
                });
                log.info({ scheduled: dailyWorkouts.length }, 'Weekly schedule created');
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            steps.push({ step: 'Schemalägg vecka', status: 'error', detail: msg });
            errors.push(`Schemaläggning misslyckades: ${msg}`);
            log.error({ err: msg }, 'Failed to schedule workouts');
        }
    }

    // ── Step 5: Trainer note with client summary ──
    if (plan.clientSummary) {
        try {
            await addTrainerNote({
                userID: clientId,
                content: plan.clientSummary,
                type: 'general',
            });
            steps.push({
                step: 'Lägg till klientnotering',
                status: 'ok',
                detail: 'Klientsammanfattning tillagd i profilen',
            });
            log.info('Trainer note added');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            steps.push({ step: 'Lägg till klientnotering', status: 'error', detail: msg });
            errors.push(`Kunde inte lägga till notering: ${msg}`);
            log.error({ err: msg }, 'Failed to add trainer note');
        }
    }

    // ── Done ──
    const ok = errors.length === 0;
    log.info({ ok, steps: steps.length, errors: errors.length }, 'Onboarding execution complete');

    return { ok, steps, trainingPlanId, workoutDefIds, errors };
}
