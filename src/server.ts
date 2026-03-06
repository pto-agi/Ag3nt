#!/usr/bin/env node
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './shared/logger.js';

// ── Trainerize API ──
import * as tz from './shared/integrations/trainerize-api.js';

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
        const result = await tz.getTrainingPlanList(req.params.id);
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
        const result = await tz.getCalendarList(req.params.id, start, end);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Get workout definitions for a training plan
app.get('/api/trainerize/plan/:id/workouts', async (req, res) => {
    try {
        const result = await tz.getWorkoutDefListForPlan(req.params.id);
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
        const result = await tz.scheduleDailyWorkout(trainerID, dailyWorkouts);
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
        const result = await tz.replyToMessage(threadId, body);
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
        const result = await tz.getProgramList(type);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Add user to program
app.post('/api/trainerize/program/assign', async (req, res) => {
    try {
        const { userId, programId, startDate } = req.body;
        const result = await tz.addUserToProgram(userId, programId, startDate);
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

// Fallback: serve dashboard
app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
});

app.listen(PORT, () => {
    logger.info({ port: PORT }, '🚀 AntiGravity Agent server started');
    console.log(`\n  Dashboard: http://localhost:${PORT}/`);
    console.log(`  API:       http://localhost:${PORT}/api/trainerize/clients\n`);
});
