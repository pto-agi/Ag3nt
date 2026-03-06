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
    const noise = new Set(['the', 'a', 'an', 'to', 'with', 'and', 'on', 'in', 'up', '-', 'med', 'på', 'och', 'för', 'en', 'ett']);
    return s.split(/[\s\-\/]+/)
        .map(w => w.replace(/[^a-zåäö0-9]/g, ''))
        .filter(w => w.length > 1 && !noise.has(w));
}

/**
 * Swedish → English exercise name aliases.
 * Maps common Swedish exercise names/keywords to their English equivalents.
 */
const SWEDISH_ALIASES: Record<string, string> = {
    // Full exercise names
    'bänkpress': 'bench press',
    'bänkpress med stång': 'barbell bench press',
    'bänkpress med hantlar': 'dumbbell bench press',
    'hantelpress': 'dumbbell bench press',
    'marklyft': 'deadlift',
    'marklyft med stång': 'barbell deadlift',
    'rumänsk marklyft': 'romanian deadlift',
    'knäböj': 'squat',
    'knäböj med stång': 'barbell squat',
    'benböj': 'squat',
    'frontböj': 'front squat',
    'axelpress': 'shoulder press',
    'militärpress': 'overhead press',
    'latsdrag': 'lat pulldown',
    'rodd': 'row',
    'skivstångsrodd': 'barbell row',
    'hantelrodd': 'dumbbell row',
    'kabelrodd': 'cable row',
    'sittande rodd': 'seated cable row',
    'bicepscurl': 'bicep curl',
    'biceps curl': 'bicep curl',
    'hantelcurl': 'dumbbell curl',
    'stångcurl': 'barbell curl',
    'tricepspress': 'tricep extension',
    'triceps pressdown': 'tricep pushdown',
    'tricep pushdown': 'tricep pushdown',
    'benspark': 'leg extension',
    'benpress': 'leg press',
    'bencurl': 'leg curl',
    'benböjning': 'leg curl',
    'sidohöjning': 'lateral raise',
    'sidhöjning': 'lateral raise',
    'framhöjning': 'front raise',
    'utfall': 'lunge',
    'utfallssteg': 'lunge',
    'höftlyft': 'hip thrust',
    'plankan': 'plank',
    'plankan med arm': 'plank',
    'situps': 'sit up',
    'sit ups': 'sit up',
    'magövning': 'abs',
    'dips': 'dip',
    'chins': 'chin up',
    'chinups': 'chin up',
    'pullups': 'pull up',
    'pull ups': 'pull up',
    'vadpress': 'calf raise',
    'axelrotation': 'external rotation',
    'utåtrotation': 'external rotation',
    'inåtrotation': 'internal rotation',
    'brygga': 'glute bridge',
    'rygglyft': 'back extension',
    'trycka': 'press',
    'face pull': 'face pull',
    'cable face pull': 'cable face pull',
    'flyes': 'fly',
    'bröstflyes': 'chest fly',
    'omvänd flyes': 'reverse fly',
    'bakre axlar': 'rear delt',
    'bulgariska utfall': 'bulgarian split squat',
    'bulgarsplit': 'bulgarian split squat',
};

/**
 * Swedish keyword → English keyword mapping for partial matches.
 */
const SWEDISH_KEYWORDS: Record<string, string> = {
    'hantel': 'dumbbell',
    'hantlar': 'dumbbell',
    'stång': 'barbell',
    'skivstång': 'barbell',
    'kabel': 'cable',
    'maskin': 'machine',
    'sittande': 'seated',
    'stående': 'standing',
    'liggande': 'lying',
    'bröst': 'chest',
    'rygg': 'back',
    'axlar': 'shoulder',
    'axel': 'shoulder',
    'ben': 'leg',
    'biceps': 'bicep',
    'triceps': 'tricep',
    'mage': 'abs',
    'core': 'core',
    'rumpa': 'glute',
    'vader': 'calf',
    'press': 'press',
    'curl': 'curl',
    'drag': 'pull',
    'lyft': 'raise',
    'höjning': 'raise',
    'böj': 'squat',
    'rotation': 'rotation',
};

/**
 * Translate a Swedish exercise name/query to English.
 * Tries full phrase match first, then word-by-word keyword replacement.
 */
function translateToEnglish(query: string): string {
    const q = query.toLowerCase().trim();

    // 1. Full phrase match
    if (SWEDISH_ALIASES[q]) return SWEDISH_ALIASES[q];

    // 2. Partial phrase match (check if query contains a known alias)
    for (const [sv, en] of Object.entries(SWEDISH_ALIASES)) {
        if (q.includes(sv)) return q.replace(sv, en);
    }

    // 3. Word-by-word keyword replacement
    const words = q.split(/\s+/);
    let translated = false;
    const result = words.map(w => {
        if (SWEDISH_KEYWORDS[w]) {
            translated = true;
            return SWEDISH_KEYWORDS[w];
        }
        return w;
    });

    return translated ? result.join(' ') : q;
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
 * Handles Swedish names via translation, then multi-strategy fuzzy matching.
 */
export async function searchExerciseByName(name: string): Promise<{ id: number; name: string; score: number } | null> {
    const cache = await getCache();

    // Translate Swedish → English if applicable
    const translated = translateToEnglish(name);
    const wasTranslated = translated.toLowerCase() !== name.toLowerCase();
    if (wasTranslated) {
        logger.info({ original: name, translated, step: 'exercise-cache' }, 'Translated exercise name');
    }

    // Try translated name first (higher priority), then original
    const queriesToTry = wasTranslated ? [translated, name] : [name];

    let bestScore = 0;
    let bestMatch: CachedExercise | null = null;

    for (const query of queriesToTry) {
        const queryNorm = normalize(query);
        const queryWords = extractWords(queryNorm);
        if (queryWords.length === 0) continue;

        for (const ex of cache) {
            const score = matchScore(queryWords, queryNorm, ex);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = ex;
            }
        }

        // If we got a good match from translated query, don't try original
        if (bestScore >= 200) break;
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
