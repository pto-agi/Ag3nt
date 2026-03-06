#!/usr/bin/env node
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './shared/logger.js';

// ── Trainerize API ──
import * as tz from './shared/integrations/trainerize-api.js';
import { searchExerciseByName } from './shared/integrations/exercise-cache.js';

// ── AI Service ──
import * as aiTrainer from './shared/ai/ai-trainer.js';
import { executeOnboarding } from './shared/ai/onboarding-executor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3847;

app.use(cors());
app.use(express.json());

// Serve dashboard static files
app.use(express.static(path.join(__dirname, '..', 'dashboard')));

// ═══════════════════════════════════════════════════════
// ── Trainerize API Proxy (Dashboard → API directly) ──
// ═══════════════════════════════════════════════════════

// List all active clients
app.get('/api/trainerize/clients', async (_req, res) => {
    try {
        const result = await tz.getClientList({ view: 'allActive', count: 200, verbose: true });
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Search for a client by name/email
app.get('/api/trainerize/clients/search', async (req, res) => {
    try {
        const q = req.query.q as string;
        if (!q) return res.status(400).json({ ok: false, error: 'q is required' });
        const result = await tz.findUser(q);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Get client profile
app.get('/api/trainerize/client/:id/profile', async (req, res) => {
    try {
        const result = await tz.getUserProfile([parseInt(req.params.id)]);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Get client summary (body stats, compliance, etc)
app.get('/api/trainerize/client/:id/summary', async (req, res) => {
    try {
        const result = await tz.getClientSummary(parseInt(req.params.id));
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Get training plans for a client
app.get('/api/trainerize/client/:id/plans', async (req, res) => {
    try {
        const result = await tz.getTrainingPlanList(parseInt(req.params.id));
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Get calendar for a client
app.get('/api/trainerize/client/:id/calendar', async (req, res) => {
    try {
        const start = req.query.start as string || new Date().toISOString().split('T')[0];
        const end = req.query.end as string || new Date(Date.now() + 28 * 86400000).toISOString().split('T')[0];
        const result = await tz.getCalendarList(parseInt(req.params.id), start, end);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Get workout definitions for a training plan
app.get('/api/trainerize/plan/:id/workouts', async (req, res) => {
    try {
        const result = await tz.getWorkoutDefListForPlan(parseInt(req.params.id));
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Get workout definition details
app.post('/api/trainerize/workout/get', async (req, res) => {
    try {
        const { ids } = req.body;
        const result = await tz.getWorkoutDef(ids);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Update workout definition
app.post('/api/trainerize/workout/set', async (req, res) => {
    try {
        const result = await tz.setWorkoutDef(req.body.workoutDef);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Create a new training plan
app.post('/api/trainerize/plan/create', async (req, res) => {
    try {
        const { userId, plan } = req.body;
        const result = await tz.addTrainingPlan(userId, plan);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Create a new workout definition
app.post('/api/trainerize/workout/create', async (req, res) => {
    try {
        const result = await tz.addWorkoutDef(req.body);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Schedule daily workouts
app.post('/api/trainerize/calendar/schedule', async (req, res) => {
    try {
        const { trainerID, dailyWorkouts } = req.body;
        const result = await tz.scheduleDailyWorkout({ userID: trainerID, dailyWorkouts });
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Get daily workout details
app.post('/api/trainerize/dailyworkout/get', async (req, res) => {
    try {
        const { ids } = req.body;
        const result = await tz.getDailyWorkout(ids);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Get inbox message threads
app.get('/api/trainerize/messages', async (req, res) => {
    try {
        const userId = parseInt(req.query.userId as string) || 4452827;
        const result = await tz.getMessageThreads(userId);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Reply to a message thread
app.post('/api/trainerize/messages/reply', async (req, res) => {
    try {
        const { threadId, body } = req.body;
        const result = await tz.replyToMessage({ threadID: threadId, body });
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Send a new message
app.post('/api/trainerize/messages/send', async (req, res) => {
    try {
        const result = await tz.sendMessage(req.body);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Add trainer note
app.post('/api/trainerize/note/add', async (req, res) => {
    try {
        const result = await tz.addTrainerNote(req.body);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Get trainer notes for a client
app.get('/api/trainerize/client/:id/notes', async (req, res) => {
    try {
        const result = await tz.getTrainerNotes(parseInt(req.params.id));
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Get exercise by ID
app.get('/api/trainerize/exercise/:id', async (req, res) => {
    try {
        const result = await tz.getExercise(parseInt(req.params.id));
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Get master program list
app.get('/api/trainerize/programs', async (req, res) => {
    try {
        const type = (req.query.type as any) || 'all';
        const result = await tz.getProgramList({ type });
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Add user to program
app.post('/api/trainerize/program/assign', async (req, res) => {
    try {
        const { userId, programId, startDate } = req.body;
        const result = await tz.addUserToProgram({ id: programId, userID: userId, startDate });
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Generic API call (for testing any endpoint)
app.post('/api/trainerize/raw', async (req, res) => {
    try {
        const { endpoint, body } = req.body;
        const result = await tz.apiCall(endpoint, body);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════
// ── AI Service Endpoints (Gemini 3.1 Pro) ──
// ═══════════════════════════════════════════════

// Generate onboarding program from intake data
app.post('/api/ai/onboard', async (req, res) => {
    try {
        const intake = req.body;
        if (!intake?.firstName) {
            return res.status(400).json({ ok: false, error: 'firstName is required' });
        }
        logger.info({ client: intake.firstName, step: 'ai-endpoint' }, 'AI onboarding request');
        const result = await aiTrainer.generateOnboardingProgram(intake);
        res.json({ ok: true, data: result });
    } catch (err: any) {
        logger.error({ error: err.message, step: 'ai-endpoint' }, 'AI onboarding failed');
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Suggest exercise replacement
app.post('/api/ai/suggest-exercise', async (req, res) => {
    try {
        const context = req.body;
        if (!context?.currentExercise) {
            return res.status(400).json({ ok: false, error: 'currentExercise is required' });
        }
        const result = await aiTrainer.suggestExerciseReplacement(context);
        res.json({ ok: true, data: result });
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Compose message reply
app.post('/api/ai/compose-message', async (req, res) => {
    try {
        const context = req.body;
        if (!context?.clientName || !context?.message) {
            return res.status(400).json({ ok: false, error: 'clientName and message are required' });
        }
        const result = await aiTrainer.composeMessageReply(context);
        res.json({ ok: true, data: result });
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Freeform AI query
app.post('/api/ai/query', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ ok: false, error: 'prompt is required' });
        }
        const result = await aiTrainer.freeformQuery(prompt);
        res.json({ ok: true, data: { response: result } });
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Execute AI-generated onboarding plan in Trainerize
app.post('/api/ai/execute-onboarding', async (req, res) => {
    try {
        const { clientId, trainerId, onboardingResult } = req.body;
        if (!clientId || !trainerId || !onboardingResult) {
            return res.status(400).json({ ok: false, error: 'clientId, trainerId, and onboardingResult are required' });
        }
        logger.info({ clientId, step: 'ai-endpoint' }, 'Executing onboarding plan');
        const result = await executeOnboarding({ clientId, trainerId, onboardingResult });
        res.json({ ok: result.ok, data: result });
    } catch (err: any) {
        logger.error({ error: err.message, step: 'ai-endpoint' }, 'Execute onboarding failed');
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════
// ── Cases (Ärenden) ──
// ═══════════════════════════════════════════════

interface CaseRecord {
    id: string;
    text: string;
    analysis: any;
    status: 'pending' | 'executing' | 'completed' | 'failed' | 'rejected';
    createdAt: string;
    executedAt?: string;
    executionResult?: any;
}

const cases = new Map<string, CaseRecord>();

// Analyze a free-text case request
app.post('/api/cases/analyze', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ ok: false, error: 'text is required' });
        }
        logger.info({ step: 'cases' }, 'Analyzing new case');

        // Enrich case text with client's existing workout data so AI avoids duplicates
        let enrichedText = text;
        try {
            // Try to extract client identifier from text (email or name)
            const emailMatch = text.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/);
            const clientHint = emailMatch ? emailMatch[0] : '';
            if (clientHint) {
                const searchResult = await tz.findUser(clientHint);
                const users = searchResult?.data?.result || searchResult?.data?.users || [];
                if (users.length > 0) {
                    const clientId = users[0].id;
                    const plansRes = await tz.getTrainingPlanList(clientId);
                    const plans = plansRes?.data?.plans || [];
                    if (plans.length > 0) {
                        const wdListRes = await tz.getWorkoutDefListForPlan(plans[0].id);
                        const wdEntries = wdListRes?.data?.workouts || [];
                        if (wdEntries.length > 0) {
                            const allIds = wdEntries.map((w: any) => w.id);
                            const wdRes = await tz.getWorkoutDef(allIds);
                            const allDefs = wdRes?.data?.workoutDef || [];
                            const workoutSummary = allDefs.map((wd: any) => {
                                const exNames = (wd.exercises || []).map((e: any) => e.def?.name || `ID:${e.def?.id}`).join(', ');
                                return `- ${wd.name}: [${exNames}]`;
                            }).join('\n');
                            enrichedText += `\n\n## Klientens nuvarande träningsprogram\n${workoutSummary}\n\nVIKTIGT: Föreslå INTE en övning som redan finns i klientens program. Välj en övning som kompletterar det befintliga upplägget.`;
                            logger.info({ step: 'cases' }, 'Enriched case with existing workout data');
                        }
                    }

                    // ── Load trainer notes for client context (goals, injuries, history) ──
                    try {
                        const notesRes = await tz.getTrainerNotes(clientId);
                        const notes = notesRes?.data?.notes || notesRes?.data?.result || [];
                        if (notes.length > 0) {
                            const notesSummary = notes
                                .slice(0, 20) // Cap at 20 most recent notes
                                .map((n: any) => {
                                    const date = n.createdDate || n.date || '';
                                    const content = (n.content || '').slice(0, 500);
                                    return `[${date}] ${content}`;
                                })
                                .join('\n\n');
                            enrichedText += `\n\n## Klienthistorik (tränarnotes)\nFöljande anteckningar finns om klienten. Använd denna information för att fatta bättre beslut — t.ex. undvik övningar som belastar skadade områden, respektera klientens mål och preferenser.\n\n${notesSummary}`;
                            logger.info({ noteCount: notes.length, step: 'cases' }, 'Enriched case with trainer notes');
                        }
                    } catch (noteErr: any) {
                        logger.warn({ error: noteErr.message, step: 'cases' }, 'Could not load trainer notes');
                    }
                }
            }
        } catch (err: any) {
            logger.warn({ error: err.message, step: 'cases' }, 'Could not enrich case with workout data');
        }

        const analysis = await aiTrainer.analyzeCaseRequest(enrichedText);

        const id = `case-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const caseRecord: CaseRecord = {
            id,
            text,
            analysis,
            status: 'pending',
            createdAt: new Date().toISOString(),
        };
        cases.set(id, caseRecord);

        res.json({ ok: true, data: caseRecord });
    } catch (err: any) {
        logger.error({ error: err.message, step: 'cases' }, 'Case analysis failed');
        res.status(500).json({ ok: false, error: err.message });
    }
});

// List all cases
app.get('/api/cases', (_req, res) => {
    const list = Array.from(cases.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    res.json({ ok: true, data: list });
});

// ── Helper functions for workout matching and saving ──

function matchWorkoutByExercise(workouts: any[], exerciseName: string): any | null {
    const nameL = exerciseName.toLowerCase();
    const pushKeywords = ['press', 'push', 'bänk', 'bench', 'shoulder', 'axel', 'tricep', 'dip', 'fly', 'hantel'];
    const pullKeywords = ['row', 'pull', 'curl', 'bicep', 'rygg', 'back', 'lat', 'drag'];
    const legKeywords = ['squat', 'leg', 'ben', 'lunge', 'hip', 'glute', 'rumpa', 'calf'];

    const isPush = pushKeywords.some(k => nameL.includes(k));
    const isPull = pullKeywords.some(k => nameL.includes(k));
    const isLeg = legKeywords.some(k => nameL.includes(k));

    if (isPush) return workouts.find(w => /push|bröst|chest|överkropp.*push|axel|shoulder/i.test(w.name || ''));
    if (isPull) return workouts.find(w => /pull|rygg|back|överkropp.*pull/i.test(w.name || ''));
    if (isLeg) return workouts.find(w => /ben|leg|underkropp|lower/i.test(w.name || ''));
    return null;
}

function matchCalendarItem(items: Array<{ id: number; title: string; date: string }>, exerciseName: string) {
    const nameL = exerciseName.toLowerCase();
    const pushKeywords = ['press', 'push', 'bänk', 'bench', 'shoulder', 'axel', 'tricep', 'dip', 'fly', 'hantel'];
    const pullKeywords = ['row', 'pull', 'curl', 'bicep', 'rygg', 'back', 'lat', 'drag'];
    const legKeywords = ['squat', 'leg', 'ben', 'lunge', 'hip', 'glute', 'rumpa', 'calf'];

    const isPush = pushKeywords.some(k => nameL.includes(k));
    const isPull = pullKeywords.some(k => nameL.includes(k));
    const isLeg = legKeywords.some(k => nameL.includes(k));

    if (isPush) return items.find(it => /push|bröst|chest|överkropp.*push|axel|shoulder/i.test(it.title));
    if (isPull) return items.find(it => /pull|rygg|back|överkropp.*pull/i.test(it.title));
    if (isLeg) return items.find(it => /ben|leg|underkropp|lower/i.test(it.title));
    return null;
}

async function saveWorkout(workout: any, exercises: any[]) {
    const cleanExercises = exercises.map((e: any) => ({
        def: {
            id: e.def.id,
            sets: e.def.sets,
            target: e.def.target,
            restTime: e.def.restTime,
            recordType: e.def.recordType || 'strength',
            supersetType: e.def.supersetType || 'none',
            superSetID: e.def.superSetID || 0,
            side: e.def.side || null,
        },
    }));

    const payload = {
        id: workout.id,
        name: workout.name,
        instruction: workout.instruction,
        type: workout.type,
        style: workout.style,
        exercises: cleanExercises,
    };

    logger.info({ workout: workout.name, exercises: cleanExercises.length, step: 'save-workout' },
        'Saving workout definition');

    const res = await tz.setWorkoutDef(payload);
    if (!res.ok) throw new Error(`workoutDef/set misslyckades: ${res.error || JSON.stringify(res.raw)}`);
}

// Execute (approve) a case
app.post('/api/cases/:id/execute', async (req, res) => {
    try {
        const caseRecord = cases.get(req.params.id);
        if (!caseRecord) {
            return res.status(404).json({ ok: false, error: 'Case not found' });
        }
        if (caseRecord.status !== 'pending') {
            return res.status(400).json({ ok: false, error: `Case is already ${caseRecord.status}` });
        }

        caseRecord.status = 'executing';
        const steps: Array<{ step: string; status: string; detail?: string }> = [];
        const analysis = caseRecord.analysis;

        // Step 1: Find the client
        let client: any = null;
        if (analysis.clientIdentifier) {
            try {
                const searchResult = await tz.findUser(analysis.clientIdentifier);
                const users = searchResult?.data?.result || searchResult?.data?.users || [];
                if (users.length > 0) {
                    client = users[0];
                    steps.push({ step: 'Hitta klient', status: 'ok', detail: `${client.firstName} ${client.lastName || ''} (ID: ${client.id})` });
                } else {
                    steps.push({ step: 'Hitta klient', status: 'warn', detail: `Ingen klient hittad för "${analysis.clientIdentifier}"` });
                }
            } catch (err: any) {
                steps.push({ step: 'Hitta klient', status: 'error', detail: err.message });
            }
        }

        // Step 2: Execute each AI-suggested action
        // Buffer for new workouts — we collect exercises first, then create via API after the loop
        // (Trainerize API requires at least 1 exercise when creating a workout)
        const pendingWorkouts = new Map<string, { name: string; exercises: any[]; steps: Array<{ step: string; status: string; detail: string }> }>();
        let planId: number | null = null;

        if (client && analysis.actions?.length) {
            // Pre-load planId for workout creation
            try {
                const plansRes = await tz.getTrainingPlanList(client.id);
                const plans = plansRes?.data?.plans || [];
                if (plans.length > 0) planId = plans[0].id;
            } catch { }

            for (const action of analysis.actions) {
                try {
                    // ── Create Workout (Phase 1: buffer only) ──
                    if (action.type === 'create_workout') {
                        const wName = action.params?.workoutName || action.description;
                        if (!planId) {
                            steps.push({ step: action.description, status: 'error', detail: 'Inget träningsprogram hittades' });
                            continue;
                        }
                        pendingWorkouts.set(wName.toLowerCase(), { name: wName, exercises: [], steps: [] });
                        logger.info({ workoutName: wName, step: 'execute' }, 'Buffering new workout for creation');
                        steps.push({ step: action.description, status: 'ok', detail: `Pass "${wName}" förbereds...` });
                        continue;
                    }
                    if (action.type === 'add_exercise' || action.type === 'replace_exercise' || action.type === 'remove_exercise') {
                        const exerciseName = action.params?.replacementExercise || action.params?.exerciseName || '';
                        const targetWorkout = action.params?.targetWorkout || '';

                        // ── Check if targetWorkout matches a pending (buffered) workout ──
                        let pendingMatch: { name: string; exercises: any[]; steps: Array<{ step: string; status: string; detail: string }> } | null = null;
                        if (targetWorkout) {
                            for (const [key, pw] of pendingWorkouts) {
                                if (pw.name.toLowerCase().includes(targetWorkout.toLowerCase()) ||
                                    targetWorkout.toLowerCase().includes(key)) {
                                    pendingMatch = pw;
                                    break;
                                }
                            }
                        }

                        // If it's for a pending workout, buffer the exercise
                        if (pendingMatch && action.type === 'add_exercise') {
                            if (!exerciseName) { steps.push({ step: action.description, status: 'warn', detail: 'Inget övningsnamn angivet' }); continue; }
                            const match = await searchExerciseByName(exerciseName);
                            if (!match) { steps.push({ step: action.description, status: 'error', detail: `Övningen "${exerciseName}" hittades inte` }); continue; }

                            const alreadyExists = pendingMatch.exercises.some((e: any) => e.def?.id === match.id);
                            if (alreadyExists) {
                                steps.push({ step: action.description, status: 'warn', detail: `"${match.name}" finns redan i "${pendingMatch.name}" — hoppar över` });
                                continue;
                            }

                            const newExercise = { def: { id: match.id, sets: 3, target: '10', restTime: 90, recordType: 'strength', supersetType: 'none' } };
                            pendingMatch.exercises.push(newExercise);
                            pendingMatch.steps.push({ step: action.description, status: 'ok', detail: `"${match.name}" tillagd i "${pendingMatch.name}"` });
                            steps.push({ step: action.description, status: 'ok', detail: `"${match.name}" tillagd i "${pendingMatch.name}"` });
                            continue;
                        }

                        // ── Load ALL workout definitions from training plan ──
                        const plansRes = await tz.getTrainingPlanList(client.id);
                        const plans = plansRes?.data?.plans || [];
                        const plan = plans[0];

                        let allWorkoutDefs: any[] = [];

                        if (plan) {
                            const wdListRes = await tz.getWorkoutDefListForPlan(plan.id);
                            const wdEntries = wdListRes?.data?.workouts || [];
                            if (wdEntries.length > 0) {
                                // Load all full workout defs at once
                                const allIds = wdEntries.map((w: any) => w.id);
                                const wdRes = await tz.getWorkoutDef(allIds);
                                allWorkoutDefs = wdRes?.data?.workoutDef || [];
                            }
                        }

                        if (!allWorkoutDefs.length) {
                            steps.push({ step: action.description, status: 'warn', detail: 'Kunde inte hitta något pass i träningsprogrammet' });
                            continue;
                        }

                        // Pick the best workout: AI-suggested first, then smart match
                        let workout: any = null;
                        if (targetWorkout) {
                            workout = allWorkoutDefs.find((w: any) => w.name?.toLowerCase().includes(targetWorkout.toLowerCase())) || allWorkoutDefs[0];
                        } else {
                            workout = matchWorkoutByExercise(allWorkoutDefs, exerciseName) || allWorkoutDefs[0];
                        }

                        let exercises = workout.exercises || [];
                        let workoutName = workout.name || 'passet';

                        // ── Execute the action ──
                        if (action.type === 'add_exercise') {
                            if (!exerciseName) { steps.push({ step: action.description, status: 'warn', detail: 'Inget övningsnamn angivet' }); continue; }
                            const match = await searchExerciseByName(exerciseName);
                            if (!match) { steps.push({ step: action.description, status: 'error', detail: `Övningen "${exerciseName}" hittades inte` }); continue; }

                            // ── Duplicate check: skip if exercise already exists in workout ──
                            const alreadyExists = exercises.some((e: any) => e.def?.id === match.id);
                            if (alreadyExists) {
                                steps.push({ step: action.description, status: 'warn', detail: `"${match.name}" finns redan i "${workoutName}" — hoppar över` });
                                continue;
                            }

                            const newExercise = { def: { id: match.id, sets: 3, target: '10', restTime: 90, recordType: 'strength', supersetType: 'none' } };
                            // Insert at AI-suggested optimal position (1-indexed), or append
                            const pos = action.params?.optimalPosition;
                            if (pos && pos >= 1 && pos <= exercises.length) {
                                exercises.splice(pos - 1, 0, newExercise);
                            } else {
                                exercises.push(newExercise);
                            }
                            await saveWorkout(workout, exercises);
                            const posLabel = pos ? ` (position ${pos})` : '';
                            steps.push({ step: action.description, status: 'ok', detail: `"${match.name}" tillagd i "${workoutName}"${posLabel}` });

                        } else if (action.type === 'replace_exercise') {
                            const oldName = action.params?.exerciseName;
                            const newName = action.params?.replacementExercise;
                            if (!oldName || !newName) { steps.push({ step: action.description, status: 'warn', detail: 'Saknar övningsnamn' }); continue; }
                            const newMatch = await searchExerciseByName(newName);
                            if (!newMatch) { steps.push({ step: action.description, status: 'error', detail: `"${newName}" hittades inte` }); continue; }
                            const oldMatch = await searchExerciseByName(oldName);
                            let idx = exercises.findIndex((e: any) => oldMatch && e.def?.id === oldMatch.id);

                            // If not found in AI-suggested workout, search ALL other workouts
                            if (idx < 0 && oldMatch) {
                                for (const wd of allWorkoutDefs) {
                                    if (wd.id === workout.id) continue;
                                    const wdExercises = wd.exercises || [];
                                    const wdIdx = wdExercises.findIndex((e: any) => e.def?.id === oldMatch.id);
                                    if (wdIdx >= 0) {
                                        workout = wd;
                                        exercises = wdExercises;
                                        workoutName = wd.name || 'passet';
                                        idx = wdIdx;
                                        logger.info({ foundIn: workoutName, step: 'execute' }, `Exercise found in different workout`);
                                        break;
                                    }
                                }
                            }

                            if (idx >= 0) {
                                exercises[idx].def.id = newMatch.id;
                                await saveWorkout(workout, exercises);
                                steps.push({ step: action.description, status: 'ok', detail: `Bytte "${oldMatch?.name}" → "${newMatch.name}" i "${workoutName}"` });
                            } else {
                                steps.push({ step: action.description, status: 'warn', detail: `"${oldName}" hittades inte i något pass` });
                            }

                        } else if (action.type === 'remove_exercise') {
                            const removeName = action.params?.exerciseName;
                            if (!removeName) { steps.push({ step: action.description, status: 'warn', detail: 'Inget övningsnamn angivet' }); continue; }
                            const removeMatch = await searchExerciseByName(removeName);
                            let idx = exercises.findIndex((e: any) => removeMatch && e.def?.id === removeMatch.id);

                            // If not found in AI-suggested workout, search ALL other workouts
                            if (idx < 0 && removeMatch) {
                                for (const wd of allWorkoutDefs) {
                                    if (wd.id === workout.id) continue;
                                    const wdExercises = wd.exercises || [];
                                    const wdIdx = wdExercises.findIndex((e: any) => e.def?.id === removeMatch.id);
                                    if (wdIdx >= 0) {
                                        workout = wd;
                                        exercises = wdExercises;
                                        workoutName = wd.name || 'passet';
                                        idx = wdIdx;
                                        logger.info({ foundIn: workoutName, step: 'execute' }, `Exercise found in different workout`);
                                        break;
                                    }
                                }
                            }

                            if (idx >= 0) {
                                exercises.splice(idx, 1);
                                await saveWorkout(workout, exercises);
                                steps.push({ step: action.description, status: 'ok', detail: `"${removeMatch?.name}" borttagen från "${workoutName}"` });
                            } else {
                                steps.push({ step: action.description, status: 'warn', detail: `"${removeName}" hittades inte i något pass` });
                            }
                        }

                    } else {
                        // Non-exercise actions (add_note, send_message, etc.) — handled below or log as info
                        steps.push({ step: action.description, status: 'ok', detail: 'Åtgärd noterad' });
                    }
                } catch (err: any) {
                    steps.push({ step: action.description, status: 'error', detail: err.message });
                }
            }
        }

        // Phase 2: Create all pending workouts via API (with their collected exercises)
        if (planId && pendingWorkouts.size > 0) {
            for (const [key, pw] of pendingWorkouts) {
                if (pw.exercises.length === 0) {
                    logger.warn({ workoutName: pw.name, step: 'execute' }, 'Skipping workout creation — no exercises collected');
                    // Update the pending step
                    const idx = steps.findIndex(s => s.detail?.includes(pw.name) && s.detail?.includes('förbereds'));
                    if (idx >= 0) steps[idx] = { step: steps[idx].step, status: 'warn', detail: `Pass "${pw.name}" hade inga övningar — hoppades över` };
                    continue;
                }
                try {
                    const addRes = await tz.addWorkoutDef({
                        type: 'trainingPlan',
                        trainingPlanID: planId,
                        workoutDef: {
                            name: pw.name,
                            type: 'workoutRegular',
                            exercises: pw.exercises.map(e => ({
                                def: {
                                    id: e.def.id,
                                    sets: e.def.sets || 3,
                                    target: e.def.target || '10',
                                    restTime: e.def.restTime || 90,
                                    recordType: e.def.recordType || 'strength',
                                    supersetType: e.def.supersetType || 'none',
                                },
                            })),
                        },
                    });
                    logger.info({ workoutName: pw.name, exerciseCount: pw.exercises.length, response: JSON.stringify(addRes?.data).slice(0, 300), step: 'execute' }, 'Created workout via API');
                    // Update the pending step
                    const idx = steps.findIndex(s => s.detail?.includes(pw.name) && s.detail?.includes('förbereds'));
                    if (idx >= 0) steps[idx] = { step: steps[idx].step, status: 'ok', detail: `Pass "${pw.name}" skapat med ${pw.exercises.length} övningar ✓` };
                } catch (err: any) {
                    logger.error({ workoutName: pw.name, error: err.message, step: 'execute' }, 'Failed to create workout');
                    const idx = steps.findIndex(s => s.detail?.includes(pw.name) && s.detail?.includes('förbereds'));
                    if (idx >= 0) steps[idx] = { step: steps[idx].step, status: 'error', detail: `Kunde inte skapa "${pw.name}": ${err.message}` };
                }
            }
        }

        // Step 2: Add trainer note documenting the change
        if (client) {
            try {
                const noteContent = `[Ärende] ${analysis.summary}\n\nResonemang: ${analysis.reasoning}\n\nÅtgärder: ${analysis.actions?.map((a: any) => a.description).join(', ') || 'Inga'}`;
                await tz.addTrainerNote({
                    userID: client.id,
                    content: noteContent,
                    type: 'general',
                });
                steps.push({ step: 'Tränarnote', status: 'ok', detail: 'Anteckning tillagd i klientprofilen' });
            } catch (err: any) {
                steps.push({ step: 'Tränarnote', status: 'error', detail: err.message });
            }
        }

        // Step 3: Send confirmation message to client
        if (client && analysis.clientMessage) {
            try {
                await tz.sendMessage({
                    userID: client.trainerID || 4452827,
                    recipients: [client.id],
                    subject: 'Uppdatering av ditt träningsprogram',
                    body: analysis.clientMessage,
                });
                steps.push({ step: 'Klientmeddelande', status: 'ok', detail: 'Bekräftelsemeddelande skickat' });
            } catch (err: any) {
                steps.push({ step: 'Klientmeddelande', status: 'error', detail: err.message });
            }
        }

        const hasErrors = steps.some(s => s.status === 'error');
        caseRecord.status = hasErrors ? 'failed' : 'completed';
        caseRecord.executedAt = new Date().toISOString();
        caseRecord.executionResult = { steps, ok: !hasErrors };

        logger.info({ caseId: caseRecord.id, status: caseRecord.status, step: 'cases' }, 'Case execution complete');
        res.json({ ok: true, data: caseRecord });
    } catch (err: any) {
        const caseRecord = cases.get(req.params.id);
        if (caseRecord) caseRecord.status = 'failed';
        logger.error({ error: err.message, step: 'cases' }, 'Case execution failed');
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Reject a case
app.post('/api/cases/:id/reject', (req, res) => {
    const caseRecord = cases.get(req.params.id);
    if (!caseRecord) {
        return res.status(404).json({ ok: false, error: 'Case not found' });
    }
    caseRecord.status = 'rejected';
    res.json({ ok: true, data: caseRecord });
});

// Fallback: serve dashboard
app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
});

app.listen(PORT, () => {
    logger.info({ port: PORT }, '🚀 AntiGravity Agent server started');
    console.log(`\n  Dashboard: http://localhost:${PORT}/`);
    console.log(`  API:       http://localhost:${PORT}/api/trainerize/clients\n`);
});
