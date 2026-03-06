/**
 * AI Trainer Service
 *
 * Central service for AI-powered training decisions.
 * Uses OpenAI (GPT-5.4) for case analysis and Gemini for other features.
 */
import { askGeminiJSON, askGemini } from '../integrations/gemini.js';
import { askOpenAIJSON } from '../integrations/openai.js';
import { ONBOARDING_SYSTEM_PROMPT, ONBOARDING_JSON_SCHEMA, EXERCISE_LIST_INSTRUCTION } from './prompts/onboarding.js';
import { EXERCISE_REPLACEMENT_SYSTEM_PROMPT } from './prompts/exercise.js';
import { MESSAGE_REPLY_SYSTEM_PROMPT } from './prompts/messages.js';
import { CASE_ANALYZER_SYSTEM_PROMPT } from './prompts/arenden.js';
import { getAllExerciseNames } from '../integrations/exercise-cache.js';
import { logger } from '../logger.js';

// ── Types ──

export interface ClientIntakeData {
    firstName: string;
    lastName?: string;
    email?: string;
    age?: number;
    gender?: string;
    goals?: string;
    experience?: string;      // nybörjare | medel | avancerad
    daysPerWeek?: number;
    injuries?: string;
    equipment?: string;
    preferences?: string;
    additionalInfo?: string;
}

export interface OnboardingResult {
    clientSummary: string;
    plan: {
        name: string;
        description: string;
        durationWeeks: number;
        daysPerWeek: number;
    };
    workouts: Array<{
        name: string;
        description: string;
        exercises: Array<{
            name: string;
            sets: number;
            reps: string;
            restSeconds: number;
            notes?: string;
        }>;
    }>;
    weeklySchedule: Record<string, string | null>;
}

export interface ExerciseReplacementResult {
    recommendation: {
        exerciseName: string;
        muscleGroups: string[];
        sets: number;
        reps: string;
        restSeconds: number;
        notes?: string;
    };
    reasoning: string;
    alternatives: Array<{
        exerciseName: string;
        reasoning: string;
    }>;
}

export interface MessageReplyResult {
    reply: string;
    category: string;
    suggestedActions: string[];
    tone: string;
}

export interface CaseActionParams {
    exerciseName?: string;
    replacementExercise?: string;
    targetWorkout?: string;
    workoutName?: string;
    optimalPosition?: number;
    alternativeExercises?: string[];
    noteContent?: string;
    messageContent?: string;
    reason?: string;
}

export interface CaseAction {
    type: 'replace_exercise' | 'add_exercise' | 'remove_exercise' | 'create_workout' | 'modify_program' | 'add_note' | 'send_message' | 'other';
    description: string;
    params: CaseActionParams;
}

export interface CaseAnalysisResult {
    clientIdentifier: string;
    summary: string;
    reasoning: string;
    actions: CaseAction[];
    clientMessage: string;
}

// ── Service Methods ──

/**
 * Generate a complete training program from client intake data.
 * This is the primary onboarding function.
 */
export async function generateOnboardingProgram(
    intake: ClientIntakeData,
): Promise<OnboardingResult> {
    logger.info({ client: intake.firstName, step: 'ai-trainer' }, 'Generating onboarding program');

    const userPrompt = buildIntakePrompt(intake);

    // Load exercise library names for AI context
    let exerciseListPrompt = '';
    try {
        const exerciseNames = await getAllExerciseNames();
        exerciseListPrompt = EXERCISE_LIST_INSTRUCTION + exerciseNames.join('\n');
        logger.info({ exerciseCount: exerciseNames.length, step: 'ai-trainer' }, 'Exercise library loaded for AI context');
    } catch (err) {
        logger.warn({ step: 'ai-trainer' }, 'Could not load exercise library — AI will use generic names');
    }

    const systemPrompt = ONBOARDING_SYSTEM_PROMPT + exerciseListPrompt + '\n\nJSON-schema:\n' + ONBOARDING_JSON_SCHEMA;

    const result = await askGeminiJSON<OnboardingResult>(
        systemPrompt,
        userPrompt,
        { temperature: 0.6, maxOutputTokens: 8192 },
    );

    logger.info({
        client: intake.firstName,
        plan: result.plan?.name,
        workouts: result.workouts?.length,
        step: 'ai-trainer',
    }, 'Onboarding program generated');

    return result;
}

/**
 * Suggest a replacement exercise based on context.
 */
export async function suggestExerciseReplacement(context: {
    currentExercise: string;
    muscleGroup?: string;
    clientGoal?: string;
    clientLevel?: string;
    reason?: string;
    equipment?: string;
}): Promise<ExerciseReplacementResult> {
    logger.info({ exercise: context.currentExercise, step: 'ai-trainer' }, 'Suggesting exercise replacement');

    const userPrompt = [
        `Nuvarande övning: ${context.currentExercise}`,
        context.muscleGroup ? `Muskelgrupp: ${context.muscleGroup}` : '',
        context.clientGoal ? `Klientens mål: ${context.clientGoal}` : '',
        context.clientLevel ? `Träningsnivå: ${context.clientLevel}` : '',
        context.reason ? `Anledning till byte: ${context.reason}` : '',
        context.equipment ? `Tillgänglig utrustning: ${context.equipment}` : '',
    ].filter(Boolean).join('\n');

    return askGeminiJSON<ExerciseReplacementResult>(
        EXERCISE_REPLACEMENT_SYSTEM_PROMPT,
        userPrompt,
        { temperature: 0.5 },
    );
}

/**
 * Compose a reply to a client message.
 */
export async function composeMessageReply(context: {
    clientName: string;
    message: string;
    clientGoal?: string;
    currentProgram?: string;
    recentActivity?: string;
}): Promise<MessageReplyResult> {
    logger.info({ client: context.clientName, step: 'ai-trainer' }, 'Composing message reply');

    const userPrompt = [
        `Klient: ${context.clientName}`,
        `Meddelande från klient: "${context.message}"`,
        context.clientGoal ? `Klientens mål: ${context.clientGoal}` : '',
        context.currentProgram ? `Aktuellt program: ${context.currentProgram}` : '',
        context.recentActivity ? `Senaste aktivitet: ${context.recentActivity}` : '',
    ].filter(Boolean).join('\n');

    return askGeminiJSON<MessageReplyResult>(
        MESSAGE_REPLY_SYSTEM_PROMPT,
        userPrompt,
        { temperature: 0.7 },
    );
}

/**
 * Free-form AI query with the trainer persona.
 */
export async function freeformQuery(prompt: string): Promise<string> {
    const { TRAINER_BASE_PROMPT } = await import('./prompts/base.js');
    return askGemini(TRAINER_BASE_PROMPT, prompt, { temperature: 0.7 });
}

/**
 * Analyze a free-text case request and produce a structured action plan.
 */
export async function analyzeCaseRequest(caseText: string): Promise<CaseAnalysisResult> {
    logger.info({ step: 'ai-trainer' }, 'Analyzing case request');

    // Load exercise library for context
    let exerciseContext = '';
    try {
        const exerciseNames = await getAllExerciseNames();
        exerciseContext = '\n\nTillgängliga övningar i systemet (använd dessa namn exakt om möjligt):\n' + exerciseNames.join(', ');
        logger.info({ exerciseCount: exerciseNames.length, step: 'ai-trainer' }, 'Exercise library loaded for case analysis');
    } catch {
        logger.warn({ step: 'ai-trainer' }, 'Could not load exercise library for case analysis');
    }

    const systemPrompt = CASE_ANALYZER_SYSTEM_PROMPT + exerciseContext;

    const result = await askOpenAIJSON<CaseAnalysisResult>(
        systemPrompt,
        caseText,
        { reasoningEffort: 'medium' },
    );

    logger.info({
        client: result.clientIdentifier,
        actions: result.actions?.length,
        step: 'ai-trainer',
    }, 'Case analysis complete');

    return result;
}

// ── Helpers ──

function buildIntakePrompt(intake: ClientIntakeData): string {
    const parts = [
        `## Ny klient: ${intake.firstName}${intake.lastName ? ' ' + intake.lastName : ''}`,
        '',
    ];

    if (intake.age) parts.push(`Ålder: ${intake.age}`);
    if (intake.gender) parts.push(`Kön: ${intake.gender}`);
    if (intake.email) parts.push(`E-post: ${intake.email}`);
    parts.push('');

    if (intake.goals) parts.push(`### Mål\n${intake.goals}`);
    if (intake.experience) parts.push(`### Erfarenhet\n${intake.experience}`);
    if (intake.daysPerWeek) parts.push(`### Tillgänglighet\n${intake.daysPerWeek} dagar/vecka`);
    if (intake.injuries) parts.push(`### Skador/begränsningar\n${intake.injuries}`);
    if (intake.equipment) parts.push(`### Utrustning\n${intake.equipment}`);
    if (intake.preferences) parts.push(`### Preferenser\n${intake.preferences}`);
    if (intake.additionalInfo) parts.push(`### Övrig info\n${intake.additionalInfo}`);

    parts.push('');
    parts.push('Skapa ett komplett träningsupplägg baserat på ovanstående.');

    return parts.join('\n');
}
