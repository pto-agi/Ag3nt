/**
 * OpenAI API Integration
 *
 * Used for the case analyzer (ärenden) with GPT-5.4.
 * Other AI features (onboarding, chat) can remain on Gemini or be switched later.
 */
import OpenAI from 'openai';

let client: OpenAI | null = null;

function getClient(): OpenAI {
    if (!client) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
        client = new OpenAI({ apiKey });
    }
    return client;
}

export interface OpenAIOptions {
    model?: string;
    reasoningEffort?: 'low' | 'medium' | 'high';
}

const DEFAULT_MODEL = process.env.OPENAI_CASE_MODEL || 'gpt-5.4-2026-03-05';

/**
 * Send a prompt to OpenAI and get a text response.
 */
export async function askOpenAI(
    systemPrompt: string,
    userPrompt: string,
    options: OpenAIOptions = {},
): Promise<string> {
    const openai = getClient();
    const response = await openai.chat.completions.create({
        model: options.model || DEFAULT_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    } as any);

    return response.choices[0]?.message?.content || '';
}

/**
 * Send a prompt to OpenAI and get a parsed JSON response.
 * Uses response_format for guaranteed JSON output.
 */
export async function askOpenAIJSON<T = any>(
    systemPrompt: string,
    userPrompt: string,
    options: OpenAIOptions = {},
): Promise<T> {
    const openai = getClient();
    const response = await openai.chat.completions.create({
        model: options.model || DEFAULT_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    } as any);

    const text = response.choices[0]?.message?.content || '{}';

    try {
        return JSON.parse(text) as T;
    } catch {
        // Try to extract JSON from markdown code blocks
        const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) return JSON.parse(match[1].trim()) as T;
        throw new Error(`Failed to parse OpenAI JSON response: ${text.slice(0, 200)}`);
    }
}
