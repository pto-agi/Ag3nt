import { z } from 'zod';

const configSchema = z.object({
    trainerize: z.object({
        email: z.string().email('TRAINERIZE_EMAIL must be a valid email'),
        password: z.string().min(1, 'TRAINERIZE_PASSWORD is required'),
        baseUrl: z.string().url(),
    }),
    gemini: z.object({
        apiKey: z.string().min(1, 'GEMINI_API_KEY is required'),
        model: z.string(),
    }),
    logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
    const raw = {
        trainerize: {
            email: process.env.TRAINERIZE_EMAIL ?? '',
            password: process.env.TRAINERIZE_PASSWORD ?? '',
            baseUrl: process.env.TRAINERIZE_BASE_URL || 'https://privatetrainingonline.trainerize.com/',
        },
        gemini: {
            apiKey: process.env.GEMINI_API_KEY ?? '',
            model: process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview',
        },
        logLevel: (process.env.LOG_LEVEL as Config['logLevel']) || 'info',
    };

    return configSchema.parse(raw);
}
