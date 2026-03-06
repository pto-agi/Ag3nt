/**
 * Exercise Library Cache
 *
 * Loads and caches Trainerize's full exercise library for name → ID lookup.
 * The Trainerize API doesn't support exercise search by name, so we load all
 * exercises once and do local fuzzy matching with word-based scoring.
 */
import { apiCall } from './trainerize-api.js';
import { logger } from '../logger.js';

interface CachedExercise {
    id: number;
    name: string;
    nameLower: string;
    words: string[];
}

let exerciseCache: CachedExercise[] | null = null;
let cacheLoadPromise: Promise<CachedExercise[]> | null = null;

const PAGE_SIZE = 200;

/**
 * Load the entire exercise library from Trainerize API.
 */
async function loadExerciseLibrary(): Promise<CachedExercise[]> {
    logger.info({ step: 'exercise-cache' }, 'Loading exercise library from Trainerize...');
    const allExercises: CachedExercise[] = [];
    let start = 0;
    let total = Infinity;

    while (start < total) {
        const res = await apiCall('/exercise/find', { start, count: PAGE_SIZE }) as any;
        const data = res?.data || res;
        const exercises = data?.exercises || [];
        total = data?.total || 0;

        for (const ex of exercises) {
            if (ex.id && ex.name) {
                const nameLower = ex.name.toLowerCase().trim();
                allExercises.push({
                    id: ex.id,
                    name: ex.name,
                    nameLower,
                    words: extractWords(nameLower),
                });
            }
        }

        start += PAGE_SIZE;
        if (exercises.length === 0) break;
    }

    logger.info({ count: allExercises.length, step: 'exercise-cache' }, 'Exercise library loaded');
    return allExercises;
}

/** Extract significant words (skip common noise) */
function extractWords(s: string): string[] {
    const noise = new Set(['the', 'a', 'an', 'to', 'with', 'and', 'on', 'in', 'up', '-']);
    return s.split(/[\s\-\/]+/)
        .map(w => w.replace(/[^a-z0-9]/g, ''))
        .filter(w => w.length > 1 && !noise.has(w));
}

/** Normalize common exercise name variations */
function normalize(s: string): string {
    return s.toLowerCase()
        .replace(/dumbbell|db/gi, 'dumbbell')
        .replace(/barbell|bb/gi, 'barbell')
        .replace(/machine|mach/gi, 'machine')
        .replace(/seated|sitting/gi, 'seated')
        .replace(/lying|laying/gi, 'lying')
        .replace(/extensions?/gi, 'extension')
        .replace(/curls?/gi, 'curl')
        .replace(/rows?(?!\w)/gi, 'row')
        .replace(/presses?(?!\w)/gi, 'press')
        .replace(/squats?(?!\w)/gi, 'squat')
        .replace(/pulldowns?/gi, 'pulldown')
        .replace(/pull-up|pullup/gi, 'pull up')
        .replace(/push-up|pushup/gi, 'push up')
        .trim();
}

async function getCache(): Promise<CachedExercise[]> {
    if (exerciseCache) return exerciseCache;
    if (!cacheLoadPromise) {
        cacheLoadPromise = loadExerciseLibrary().then(list => {
            exerciseCache = list;
            cacheLoadPromise = null;
            return list;
        });
    }
    return cacheLoadPromise;
}

/**
 * Score how well a query matches an exercise name.
 * Higher = better. 0 = no match.
 */
function matchScore(queryWords: string[], queryNorm: string, ex: CachedExercise): number {
    const exNorm = normalize(ex.name);

    // Exact match (after normalization)
    if (exNorm === queryNorm) return 1000;

    // Exact match on original lowercase
    if (ex.nameLower === queryNorm) return 999;

    // Full containment (query in exercise or exercise in query)
    if (exNorm.includes(queryNorm)) return 800;
    if (queryNorm.includes(exNorm) && exNorm.length > 5) return 700;

    // Word overlap scoring
    const exWords = extractWords(exNorm);
    let matchedWords = 0;
    let matchedImportantWords = 0;
    const importantWords = new Set(['press', 'curl', 'row', 'squat', 'deadlift', 'pulldown',
        'extension', 'fly', 'raise', 'lunge', 'pull', 'push', 'plank', 'crunch',
        'dip', 'hip', 'thrust', 'bridge', 'split']);

    for (const qw of queryWords) {
        const qNorm = normalize(qw);
        if (exWords.some(ew => ew === qNorm || normalize(ew) === qNorm)) {
            matchedWords++;
            if (importantWords.has(qNorm)) matchedImportantWords++;
        } else if (exWords.some(ew => ew.includes(qNorm) || qNorm.includes(ew))) {
            matchedWords += 0.5;
        }
    }

    if (matchedWords === 0) return 0;

    // Score based on word overlap ratio
    const coverage = matchedWords / queryWords.length;
    const similarity = matchedWords / Math.max(queryWords.length, exWords.length);

    // Need at least one important word to be a valid match
    if (matchedImportantWords === 0 && coverage < 0.8) return 0;

    // Bonus for matching more important words
    const score = 100 * coverage + 50 * similarity + 30 * matchedImportantWords;

    // Penalty for exercise names that are much longer (too specific)
    const lengthRatio = queryWords.length / exWords.length;
    const lengthPenalty = lengthRatio > 0.5 ? 0 : 10;

    return Math.round(score - lengthPenalty);
}

/**
 * Search for an exercise by name. Returns the best match or null.
 * Uses multi-strategy matching with scoring.
 */
export async function searchExerciseByName(name: string): Promise<{ id: number; name: string; score: number } | null> {
    const cache = await getCache();
    const queryNorm = normalize(name);
    const queryWords = extractWords(queryNorm);

    if (queryWords.length === 0) return null;

    let bestScore = 0;
    let bestMatch: CachedExercise | null = null;

    for (const ex of cache) {
        const score = matchScore(queryWords, queryNorm, ex);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = ex;
        }
    }

    // Minimum threshold to accept a match
    if (bestScore < 50 || !bestMatch) {
        logger.warn({ query: name, bestScore, bestName: bestMatch?.name, step: 'exercise-cache' },
            'No good match found');
        return null;
    }

    logger.info({ query: name, matched: bestMatch.name, score: bestScore, step: 'exercise-cache' },
        'Exercise matched');
    return { id: bestMatch.id, name: bestMatch.name, score: bestScore };
}

/**
 * Search for multiple exercises. Returns matches and misses.
 */
export async function searchExercisesByName(names: string[]): Promise<{
    matches: Array<{ searchName: string; id: number; exactName: string; score: number }>;
    misses: string[];
}> {
    const matches: Array<{ searchName: string; id: number; exactName: string; score: number }> = [];
    const misses: string[] = [];

    for (const name of names) {
        const result = await searchExerciseByName(name);
        if (result) {
            matches.push({ searchName: name, id: result.id, exactName: result.name, score: result.score });
        } else {
            misses.push(name);
        }
    }

    logger.info({
        searched: names.length,
        matched: matches.length,
        missed: misses.length,
        misses: misses.length > 0 ? misses : undefined,
        step: 'exercise-cache',
    }, 'Exercise name search complete');

    return { matches, misses };
}

/**
 * Get all exercise names (for feeding to AI as context).
 */
export async function getAllExerciseNames(): Promise<string[]> {
    const cache = await getCache();
    return cache.map(ex => ex.name).sort();
}

/**
 * Force reload the cache.
 */
export async function reloadExerciseCache(): Promise<number> {
    exerciseCache = null;
    cacheLoadPromise = null;
    const cache = await getCache();
    return cache.length;
}

export function getCacheSize(): number {
    return exerciseCache?.length || 0;
}
