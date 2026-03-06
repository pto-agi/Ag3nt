/**
 * Gemini API Integration
 *
 * Central Gemini client for all AI-powered agent decisions.
 * Uses gemini-3.1-pro-preview as the primary model.
 */
import { GoogleGenerativeAI, type GenerateContentResult } from '@google/generative-ai';

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
    if (!genAI) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
        genAI = new GoogleGenerativeAI(apiKey);
    }
    return genAI;
}

export interface GeminiOptions {
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
    /** Enable thinking/reasoning budget */
    thinkingBudget?: number;
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';

/**
 * Send a prompt to Gemini and get a text response.
 */
export async function askGemini(
    systemPrompt: string,
    userPrompt: string,
    options: GeminiOptions = {},
): Promise<string> {
    const client = getClient();
    const model = client.getGenerativeModel({
        model: options.model || DEFAULT_MODEL,
        systemInstruction: systemPrompt,
        generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxOutputTokens ?? 8192,
        },
    });

    const result: GenerateContentResult = await model.generateContent(userPrompt);
    const text = result.response.text();
    return text;
}

/**
 * Send a prompt to Gemini and get a parsed JSON response.
 * The prompt should instruct the model to output valid JSON.
 */
export async function askGeminiJSON<T = any>(
    systemPrompt: string,
    userPrompt: string,
    options: GeminiOptions = {},
): Promise<T> {
    const client = getClient();
    const model = client.getGenerativeModel({
        model: options.model || DEFAULT_MODEL,
        systemInstruction: systemPrompt,
        generationConfig: {
            temperature: options.temperature ?? 0.4,
            maxOutputTokens: options.maxOutputTokens ?? 8192,
            responseMimeType: 'application/json',
        },
    });

    const result = await model.generateContent(userPrompt);
    const text = result.response.text();

    try {
        return JSON.parse(text) as T;
    } catch {
        // Try to extract JSON from markdown code blocks
        const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) return JSON.parse(match[1].trim()) as T;
        throw new Error(`Failed to parse Gemini JSON response: ${text.slice(0, 200)}`);
    }
}
